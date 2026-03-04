#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import fs from "node:fs";
import FormData from "form-data";
import path from "node:path";
import os from "node:os";
import { PLATFORMS, normalizePlatform } from "./platforms.js";

const PUBLER_API_BASE = "https://app.publer.com/api/v1";

// ── Client helpers ────────────────────────────────────────────────────────────

const PRESETS_PATH = path.join(os.homedir(), ".publer", "presets.json");

function getPresets(): Record<string, string[]> {
  try {
    if (fs.existsSync(PRESETS_PATH)) {
      return JSON.parse(fs.readFileSync(PRESETS_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function savePresets(presets: Record<string, string[]>) {
  const dir = path.dirname(PRESETS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PRESETS_PATH, JSON.stringify(presets, null, 2), "utf-8");
}

function resolveAccountIds(ids: string[]): string[] {
  const presets = getPresets();
  const resolved = new Set<string>();
  
  for (const id of ids) {
    if (id.startsWith("@")) {
      const name = id.substring(1);
      const presetIds = presets[name];
      if (presetIds) {
        presetIds.forEach(pid => resolved.add(pid));
      } else {
        resolved.add(id); // Keep as is if preset not found
      }
    } else {
      resolved.add(id);
    }
  }
  return Array.from(resolved);
}

/** Client for endpoints that require the Publer-Workspace-Id header */
function getClient(): AxiosInstance {
  const token = process.env.PUBLER_API_TOKEN;
  const workspaceId = process.env.PUBLER_WORKSPACE_ID;
  if (!token) {
    throw new Error(
      "PUBLER_API_TOKEN is not set. Run `npm run setup` to configure."
    );
  }
  if (!workspaceId) {
    throw new Error(
      "PUBLER_WORKSPACE_ID is not set. Run `npm run setup` to configure."
    );
  }
  return axios.create({
    baseURL: PUBLER_API_BASE,
    headers: {
      Authorization: `Bearer-API ${token}`,
      "Publer-Workspace-Id": workspaceId,
      "Content-Type": "application/json",
    },
  });
}

/** Client for endpoints that do NOT need a workspace header (/users/me, /workspaces) */
function getBaseClient(): AxiosInstance {
  const token = process.env.PUBLER_API_TOKEN;
  if (!token) {
    throw new Error(
      "PUBLER_API_TOKEN is not set. Run `npm run setup` to configure."
    );
  }
  return axios.create({
    baseURL: PUBLER_API_BASE,
    headers: {
      Authorization: `Bearer-API ${token}`,
      "Content-Type": "application/json",
    },
  });
}

// ── Error handling ────────────────────────────────────────────────────────────

function wrapError(err: unknown): { content: { type: "text"; text: string }[]; isError: true; remedy?: string } {
  let message = "Unknown error occurred.";
  let remedy = "Check the logs or try a different approach.";

  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as any;
    message = `Publer API error ${status}: ${JSON.stringify(data || err.message)}`;

    switch (status) {
      case 401:
        remedy = "Your API token is invalid or expired. Run `npm run setup` to refresh it.";
        break;
      case 403:
        remedy = "You don't have permission for this workspace. Check your PUBLER_WORKSPACE_ID in .env or run setup.";
        break;
      case 404:
        remedy = "The requested resource (post, account, or media) was not found. Verify the ID you provided.";
        break;
      case 413:
        remedy = "The file is too large (Publer limit is usually 200MB). Try a smaller version or a different format.";
        break;
      case 422:
        remedy = "Validation failed. " + (data?.message || "Check your post content and platform-specific limits.");
        break;
      case 429:
        remedy = "You've hit Publer's rate limit. Wait a minute and try again.";
        break;
      default:
        if (status && status >= 500) {
          remedy = "Publer servers are having trouble. Wait a few minutes and retry.";
        }
    }
  } else if (err instanceof Error) {
    message = err.message;
    if (message.includes("PUBLER_API_TOKEN")) {
      remedy = "Run `npm run setup` to configure your API credentials.";
    }
  }

  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
    remedy,
  };
}

// ── Post body builder ─────────────────────────────────────────────────────────

type MediaRef = { id: string };

function splitForPlatform(text: string, provider: string): string[] {
  const platformKey = normalizePlatform(provider);
  const config = PLATFORMS[platformKey] ?? PLATFORMS.twitter;
  
  if (text.length <= config.charLimit) return [text];
  if (!config.supportsThreading) {
    return [text.substring(0, config.charLimit - 3) + "..."];
  }

  const limit = config.charLimit - 8;
  const parts: string[] = [];
  let current = "";
  const paragraphs = text.split("\n\n");
  
  for (const para of paragraphs) {
    if ((current + para).length <= limit) {
      current += (current ? "\n\n" : "") + para;
    } else {
      if (current) parts.push(current.trim());
      if (para.length > limit) {
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        current = "";
        for (const sentence of sentences) {
          if ((current + sentence).length <= limit) {
            current += (current ? " " : "") + sentence;
          } else {
            if (current) parts.push(current.trim());
            current = sentence;
            while (current.length > limit) {
              parts.push(current.substring(0, limit).trim());
              current = current.substring(limit);
            }
          }
        }
      } else {
        current = para;
      }
    }
  }
  if (current) parts.push(current.trim());
  return parts.map((p, i) => `${p} (${i + 1}/${parts.length})`);
}

async function enrichNetworks(
  text: string,
  mediaIds: string[] | undefined,
  accountIds: string[],
  client: AxiosInstance,
  autoAdapt: boolean = false
): Promise<Record<string, any>> {
  const networks: Record<string, any> = {};
  const media = mediaIds?.map(id => ({ id })) ?? [];
  
  try {
    const res = await client.get("/accounts");
    const allAccounts = res.data as Array<{ id: string; provider: string }>;
    
    const targetProviders = new Set<string>();
    for (const id of accountIds) {
      const acc = allAccounts.find(a => a.id === id);
      if (acc) targetProviders.add(acc.provider);
    }

    for (const provider of targetProviders) {
      const config: Record<string, any> = {
        text,
        media
      };

      if (autoAdapt) {
        const parts = splitForPlatform(text, provider);
        config.text = parts[0];
        if (parts.length > 1) {
          (config as any)._parts = parts;
        }
      }

      // Set type
      if (["facebook", "mastodon", "bluesky", "threads", "telegram"].includes(provider)) {
        config.type = "status";
      } else if (provider === "instagram") {
        config.type = "post";
      } else if (provider === "linkedin") {
        config.type = "status";
      } else if (provider === "pinterest") {
        config.type = "pin";
      } else if (["youtube", "tiktok"].includes(provider)) {
        config.type = "video";
      } else {
        config.type = "status";
      }
      networks[provider] = config;
    }
  } catch (err) {
    networks.global = { text, media };
  }

  return networks;
}

async function buildScheduleBody(
  args: Record<string, unknown>,
  includeScheduledAt: boolean,
  client: AxiosInstance
): Promise<Record<string, unknown>> {
  const rawAccountIds = args.account_ids as string[];
  const accountIds = resolveAccountIds(rawAccountIds);
  const text = args.text as string;
  const mediaIds = args.media_ids as string[] | undefined;
  const autoAdapt = !!args.auto_adapt;
  
  const networks = args.networks
    ? (args.networks as Record<string, unknown>)
    : await enrichNetworks(text, mediaIds, accountIds, client, autoAdapt);

  const accounts = accountIds.map(id => {
    const entry: Record<string, any> = { id };
    if (includeScheduledAt && args.scheduled_at) {
      entry.scheduled_at = args.scheduled_at;
    }
    return entry;
  });

  if (autoAdapt) {
    try {
      const res = await client.get("/accounts");
      const allAccounts = res.data as Array<{ id: string; provider: string }>;
      
      for (const accEntry of accounts) {
        const accInfo = allAccounts.find(a => a.id === accEntry.id);
        if (accInfo) {
          const netConfig = networks[accInfo.provider];
          if (netConfig && netConfig._parts && netConfig._parts.length > 1) {
            const [_first, ...rest] = netConfig._parts;
            accEntry.comments = rest.map((t: string, i: number) => ({
              text: t,
              conditions: { 
                relation: "AND", 
                clauses: { age: { duration: i + 1, unit: "Minute" } } 
              }
            }));
          }
        }
      }
    } catch {}
  }

  Object.values(networks).forEach(v => { if (v && typeof v === 'object') delete (v as any)._parts; });

  return {
    bulk: {
      state: args.state ?? "scheduled",
      posts: [{ networks, accounts }],
    },
  };
}

async function pollJob(client: AxiosInstance, jobId: string, maxAttempts = 15): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await client.get(`/job_status/${jobId}`);
    const data = res.data;
    if (data.status !== null) return data;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error("Job polling timed out.");
}

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "publer-mcp", version: "2.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_current_user",
      description: "Get the profile of the currently authenticated Publer user",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_workspaces",
      description: "List all Publer workspaces the API token has access to",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_accounts",
      description: "List all connected social media accounts in the current workspace",
      inputSchema: {
        type: "object",
        properties: {
          provider: { type: "string", description: "Filter by provider (e.g. facebook, twitter)" },
          capability: {
            type: "string",
            enum: ["threading", "video", "photo"],
            description: "Filter by platform capability",
          },
        },
      },
    },
    {
      name: "get_platform_info",
      description: "Get combined information about all connected platforms and their limits",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_posts",
      description: "List posts with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["scheduled", "published", "failed", "draft", "draft_private", "draft_public", "recurring"] },
          states: { type: "array", items: { type: "string" } },
          from: { type: "string" },
          to: { type: "string" },
          account_ids: { type: "array", items: { type: "string" } },
          query: { type: "string" },
          postType: { type: "string" },
          member_id: { type: "string" },
          page: { type: "number" },
        },
      },
    },
    {
      name: "get_post",
      description: "Retrieve a specific post by ID",
      inputSchema: {
        type: "object",
        required: ["post_id"],
        properties: { post_id: { type: "string" } },
      },
    },
    {
      name: "update_post",
      description: "Update an existing post",
      inputSchema: {
        type: "object",
        required: ["post_id"],
        properties: {
          post_id: { type: "string" },
          text: { type: "string" },
          scheduled_at: { type: "string" },
          account_ids: { type: "array", items: { type: "string" } },
          label_ids: { type: "array", items: { type: "string" } },
          media_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "list_labels",
      description: "List all labels defined in the workspace",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_post_insights",
      description: "Get detailed performance metrics",
      inputSchema: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          account_id: { type: "string" },
        },
      },
    },
    {
      name: "get_best_times",
      description: "Get a heatmap of optimal posting times",
      inputSchema: {
        type: "object",
        properties: { account_id: { type: "string" } },
      },
    },
    {
      name: "schedule_post",
      description: "Create a scheduled post (supports auto_adapt threading)",
      inputSchema: {
        type: "object",
        required: ["account_ids", "text"],
        properties: {
          account_ids: { type: "array", items: { type: "string" } },
          text: { type: "string" },
          auto_adapt: { type: "boolean" },
          scheduled_at: { type: "string" },
          state: { type: "string", enum: ["scheduled", "draft", "draft_private", "draft_public", "recurring"] },
          media_ids: { type: "array", items: { type: "string" } },
          follow_up_text: { type: "string" },
          networks: { type: "object" },
        },
      },
    },
    {
      name: "publish_post_now",
      description: "Publish a post immediately (supports auto_adapt threading)",
      inputSchema: {
        type: "object",
        required: ["account_ids", "text"],
        properties: {
          account_ids: { type: "array", items: { type: "string" } },
          text: { type: "string" },
          auto_adapt: { type: "boolean" },
          media_ids: { type: "array", items: { type: "string" } },
          follow_up_text: { type: "string" },
          networks: { type: "object" },
        },
      },
    },
    {
      name: "publish_with_media",
      description: "Convenience: Upload media from URLs and publish in one step",
      inputSchema: {
        type: "object",
        required: ["account_ids", "text", "media_urls"],
        properties: {
          account_ids: { type: "array", items: { type: "string" } },
          text: { type: "string" },
          media_urls: {
            type: "array",
            items: {
              type: "object",
              required: ["url", "name"],
              properties: {
                url: { type: "string" },
                name: { type: "string" },
              },
            },
          },
          auto_adapt: { type: "boolean" },
          scheduled_at: { type: "string" },
        },
      },
    },
    {
      name: "delete_post",
      description: "Delete a post by ID",
      inputSchema: {
        type: "object",
        required: ["post_id"],
        properties: { post_id: { type: "string" } },
      },
    },
    {
      name: "get_job_status",
      description: "Check the status of an asynchronous Publer job",
      inputSchema: {
        type: "object",
        required: ["job_id"],
        properties: { job_id: { type: "string" } },
      },
    },
    {
      name: "list_media",
      description: "List media assets",
      inputSchema: {
        type: "object",
        properties: {
          types: { type: "array", items: { type: "string", enum: ["photo", "video", "gif"] } },
          used: { type: "array", items: { type: "boolean" } },
          source: { type: "array", items: { type: "string" } },
          ids: { type: "array", items: { type: "string" } },
          search: { type: "string" },
          page: { type: "number" },
        },
      },
    },
    {
      name: "upload_media_from_url",
      description: "Upload media from URLs",
      inputSchema: {
        type: "object",
        required: ["media"],
        properties: {
          media: { type: "array", items: { type: "object", required: ["url", "name"] } },
          in_library: { type: "boolean" },
          direct_upload: { type: "boolean" },
        },
      },
    },
    {
      name: "upload_media_file",
      description: "Upload a local file",
      inputSchema: {
        type: "object",
        required: ["file_path"],
        properties: {
          file_path: { type: "string" },
          in_library: { type: "boolean" },
          direct_upload: { type: "boolean" },
        },
      },
    },
    {
      name: "get_social_manager_instructions",
      description: "Get high-level instructions and best practices",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "split_content_into_thread",
      description: "Split long text into a thread",
      inputSchema: {
        type: "object",
        required: ["text", "platform"],
        properties: {
          text: { type: "string" },
          platform: { type: "string" },
          includeNumbering: { type: "boolean", default: true },
        },
      },
    },
    {
      name: "validate_post",
      description: "Sanity check a post against platform constraints",
      inputSchema: {
        type: "object",
        required: ["text", "platform"],
        properties: {
          text: { type: "string" },
          platform: { type: "string" },
          media_count: { type: "number" },
          media_types: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "manage_account_presets",
      description: "Manage reusable groups of social accounts",
      inputSchema: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["list", "create", "delete"] },
          name: { type: "string" },
          account_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "schedule_posts_bulk",
      description: "Schedule multiple posts at once",
      inputSchema: {
        type: "object",
        required: ["posts"],
        properties: {
          posts: { type: "array", items: { type: "object", required: ["account_ids", "text"] } },
        },
      },
    },
    {
      name: "cleanup_media",
      description: "Bulk delete media assets",
      inputSchema: {
        type: "object",
        required: ["media_ids"],
        properties: { media_ids: { type: "array", items: { type: "string" } } },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "get_current_user": {
        const res = await getBaseClient().get("/users/me");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "list_workspaces": {
        const res = await getBaseClient().get("/workspaces");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "list_accounts": {
        const res = await getClient().get("/accounts");
        let accounts = res.data as any[];
        if (args?.provider) {
          const p = (args.provider as string).toLowerCase();
          accounts = accounts.filter(a => a.provider.toLowerCase().includes(p));
        }
        if (args?.capability) {
          const cap = args.capability as string;
          accounts = accounts.filter(a => {
            const config = PLATFORMS[normalizePlatform(a.provider)];
            if (!config) return false;
            if (cap === "threading") return config.supportsThreading;
            if (cap === "video") return config.supportedMediaTypes.includes("video");
            if (cap === "photo") return config.supportedMediaTypes.includes("photo");
            return true;
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }] };
      }
      case "get_platform_info": {
        const res = await getClient().get("/accounts");
        const accounts = res.data as any[];
        const providers = Array.from(new Set(accounts.map(a => a.provider)));
        const info = providers.map(p => ({
          provider: p,
          ...(PLATFORMS[normalizePlatform(p)] || { name: p, unknown: true })
        }));
        return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
      }
      case "publish_with_media": {
        const client = getClient();
        const uploadRes = await client.post("/media/from-url", { media: args!.media_urls });
        const jobResult = await pollJob(client, uploadRes.data.job_id);
        if (jobResult.status === "failed") throw new Error(`Media upload failed: ${JSON.stringify(jobResult.payload?.failures)}`);
        const mediaIds = (jobResult.payload as any[]).map(m => m.id);
        const scheduleArgs = { ...args, media_ids: mediaIds, state: args!.scheduled_at ? "scheduled" : "published" };
        const body = await buildScheduleBody(scheduleArgs, !!args!.scheduled_at, client);
        const endpoint = args!.scheduled_at ? "/posts/schedule" : "/posts/schedule/publish";
        const res = await client.post(endpoint, body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "list_posts": {
        const a = args ?? {};
        const params: Record<string, any> = {};
        if (a.state) params.state = a.state;
        if (a.states) params["state[]"] = a.states;
        if (a.from) params.from = a.from;
        if (a.to) params.to = a.to;
        if (a.account_ids) params["account_ids[]"] = a.account_ids;
        if (a.query) params.query = a.query;
        if (a.postType) params.postType = a.postType;
        if (a.member_id) params.member_id = a.member_id;
        if (a.page !== undefined) params.page = a.page;
        const res = await getClient().get("/posts", { params });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "get_post": {
        const res = await getClient().get(`/posts/${args!.post_id}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "update_post": {
        const a = args!;
        const body: Record<string, any> = {};
        if (a.text) body.caption = a.text;
        if (a.scheduled_at) body.scheduled_at = a.scheduled_at;
        if (a.account_ids) body.account_ids = a.account_ids;
        if (a.label_ids) body.label_ids = a.label_ids;
        if (a.media_ids) body.media = (a.media_ids as string[]).map(id => ({ id }));
        const res = await getClient().put(`/posts/${a.post_id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "list_labels": {
        const res = await getClient().get("/labels");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "get_post_insights": {
        const { account_id, from, to } = args! as any;
        const path = account_id ? `/analytics/${account_id}/post_insights` : "/analytics/post_insights";
        const res = await getClient().get(path, { params: { from, to } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "get_best_times": {
        const { account_id } = args! as any;
        const path = account_id ? `/analytics/${account_id}/best_times` : "/analytics/best_times";
        const res = await getClient().get(path);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "schedule_post": {
        const client = getClient();
        const body = await buildScheduleBody(args as any, true, client);
        const res = await client.post("/posts/schedule", body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "publish_post_now": {
        const client = getClient();
        const body = await buildScheduleBody(args as any, false, client);
        const res = await client.post("/posts/schedule/publish", body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "delete_post": {
        await getClient().delete("/posts", { params: { "post_ids[]": args!.post_id } });
        return { content: [{ type: "text", text: `Post ${args!.post_id} deleted.` }] };
      }
      case "get_job_status": {
        const res = await getClient().get(`/job_status/${args!.job_id}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "list_media": {
        const a = args ?? {};
        const params: Record<string, any> = {};
        if (a.types) params["types[]"] = a.types;
        if (a.used) params["used[]"] = a.used;
        if (a.source) params["source[]"] = a.source;
        if (a.ids) params["ids[]"] = a.ids;
        if (a.search) params.search = a.search;
        if (a.page !== undefined) params.page = a.page;
        const res = await getClient().get("/media", { params });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "upload_media_from_url": {
        const res = await getClient().post("/media/from-url", args);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "upload_media_file": {
        const filePath = args!.file_path as string;
        const form = new FormData();
        form.append("file", fs.createReadStream(path.resolve(filePath)));
        if (args!.in_library !== undefined) form.append("in_library", String(args!.in_library));
        const res = await axios.post(`${PUBLER_API_BASE}/media`, form, {
          headers: { ...form.getHeaders(), Authorization: `Bearer-API ${process.env.PUBLER_API_TOKEN}`, "Publer-Workspace-Id": process.env.PUBLER_WORKSPACE_ID },
          maxBodyLength: 210 * 1024 * 1024,
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "manage_account_presets": {
        const action = args!.action as any;
        const presets = getPresets();
        if (action === "list") return { content: [{ type: "text", text: JSON.stringify(presets, null, 2) }] };
        const name = args!.name as string;
        if (action === "create") { presets[name] = args!.account_ids as string[]; savePresets(presets); return { content: [{ type: "text", text: `Preset @${name} created.` }] }; }
        if (action === "delete") { delete presets[name]; savePresets(presets); return { content: [{ type: "text", text: `Preset @${name} deleted.` }] }; }
        throw new Error("Invalid action");
      }
      case "schedule_posts_bulk": {
        const client = getClient();
        const posts = args!.posts as any[];
        const bulkPosts = [];
        for (const p of posts) {
          const networks = await enrichNetworks(p.text, p.media_ids, resolveAccountIds(p.account_ids), client);
          const accounts = resolveAccountIds(p.account_ids).map(id => ({ id, scheduled_at: p.scheduled_at }));
          bulkPosts.push({ networks, accounts });
        }
        const res = await client.post("/posts/schedule", { bulk: { state: "scheduled", posts: bulkPosts } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      case "cleanup_media": {
        await getClient().delete("/media", { params: { "media_ids[]": args!.media_ids } });
        return { content: [{ type: "text", text: `Deleted.` }] };
      }
      case "get_social_manager_instructions": {
        const skillsDir = path.join(path.resolve(new URL(import.meta.url).pathname, "..", ".."), "skills");
        let combined = "";
        if (fs.existsSync(skillsDir)) {
          for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
              const p = path.join(skillsDir, entry.name, "SKILL.md");
              if (fs.existsSync(p)) combined += `\n--- ${entry.name} ---\n${fs.readFileSync(p, "utf-8")}\n`;
            }
          }
        }
        return { content: [{ type: "text", text: combined || "Social Manager instructions..." }] };
      }
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return wrapError(err);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
