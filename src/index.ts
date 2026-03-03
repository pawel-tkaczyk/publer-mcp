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

const PUBLER_API_BASE = "https://app.publer.com/api/v1";

// ── Client helpers ────────────────────────────────────────────────────────────

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

// ── Post body builder ─────────────────────────────────────────────────────────

type MediaRef = { id: string };

function buildNetworks(
  text: string,
  mediaIds?: string[]
): Record<string, unknown> {
  const media: MediaRef[] = mediaIds?.map((id) => ({ id })) ?? [];
  // "global" applies the same content to all target platforms
  return { global: { text, media } };
}

function buildScheduleBody(
  args: Record<string, unknown>,
  includeScheduledAt: boolean
): Record<string, unknown> {
  const accountIds = args.account_ids as string[];
  const accounts = accountIds.map((id) => {
    const entry: Record<string, unknown> = { id };
    if (includeScheduledAt && args.scheduled_at) {
      entry.scheduled_at = args.scheduled_at;
    }

    if (args.follow_up_text) {
      entry.comments = [
        {
          text: args.follow_up_text as string,
          conditions: {
            relation: "AND",
            clauses: {
              age: { duration: 1, unit: "Minute" },
            },
          },
        },
      ];
    }

    return entry;
  });

  const networks =
    args.networks ??
    buildNetworks(
      args.text as string,
      args.media_ids as string[] | undefined
    );

  return {
    bulk: {
      state: args.state ?? "scheduled",
      posts: [{ networks, accounts }],
    },
  };
}

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "publer-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Users ──────────────────────────────────────────────────────────────
    {
      name: "get_current_user",
      description: "Get the profile of the currently authenticated Publer user",
      inputSchema: { type: "object", properties: {} },
    },

    // ── Workspaces ─────────────────────────────────────────────────────────
    {
      name: "list_workspaces",
      description: "List all Publer workspaces the API token has access to",
      inputSchema: { type: "object", properties: {} },
    },

    // ── Accounts ───────────────────────────────────────────────────────────
    {
      name: "list_accounts",
      description:
        "List all connected social media accounts in the current workspace",
      inputSchema: { type: "object", properties: {} },
    },

    // ── Posts ──────────────────────────────────────────────────────────────
    {
      name: "list_posts",
      description: "List posts with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["scheduled", "published", "failed", "draft", "draft_private", "draft_public", "recurring"],
            description: "Filter by a single post state",
          },
          states: {
            type: "array",
            items: { type: "string" },
            description: "Filter by multiple post states",
          },
          from: {
            type: "string",
            description: "Include posts on/after this ISO 8601 date or datetime",
          },
          to: {
            type: "string",
            description: "Include posts on/before this ISO 8601 date or datetime",
          },
          account_ids: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific account IDs",
          },
          query: {
            type: "string",
            description: "Full-text search keyword in post content",
          },
          postType: {
            type: "string",
            description: "Filter by content type (photo, video, reel, story, etc.)",
          },
          member_id: {
            type: "string",
            description: "Filter posts by the workspace member who created them",
          },
          page: {
            type: "number",
            description: "Page number for pagination (0-based, default 0)",
          },
        },
      },
    },

    {
      name: "get_post",
      description: "Retrieve a specific post by ID",
      inputSchema: {
        type: "object",
        required: ["post_id"],
        properties: {
          post_id: { type: "string", description: "The ID of the post to retrieve" },
        },
      },
    },

    {
      name: "update_post",
      description: "Update an existing post. Returns a job_id (poll get_job_status).",
      inputSchema: {
        type: "object",
        required: ["post_id"],
        properties: {
          post_id: { type: "string", description: "The ID of the post to update" },
          text: { type: "string", description: "Updated post caption" },
          scheduled_at: { type: "string", description: "Updated ISO 8601 datetime" },
          account_ids: {
            type: "array",
            items: { type: "string" },
            description: "Account IDs to target",
          },
          label_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs of labels to assign to this post",
          },
          media_ids: {
            type: "array",
            items: { type: "string" },
            description: "Updated Media IDs",
          },
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
      description: "Get detailed performance metrics for published posts",
      inputSchema: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          to: { type: "string", description: "End date (YYYY-MM-DD)" },
          account_id: { type: "string", description: "Optional: filter by account ID" },
        },
      },
    },

    {
      name: "get_best_times",
      description: "Get a heatmap of optimal posting times based on audience activity",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Optional: filter by account ID" },
        },
      },
    },

    {
      name: "schedule_post",
      description:
        "Create a scheduled (or draft/recurring) post across one or more accounts. " +
        "Returns a job_id — poll get_job_status to confirm completion.",
      inputSchema: {
        type: "object",
        required: ["account_ids", "text"],
        properties: {
          account_ids: {
            type: "array",
            items: { type: "string" },
            description: "Account IDs to post to",
          },
          text: {
            type: "string",
            description: "Post caption / text (applied to all platforms via 'global' network key)",
          },
          scheduled_at: {
            type: "string",
            description: "ISO 8601 datetime to publish (omit to use Publer's auto-scheduling)",
          },
          state: {
            type: "string",
            enum: ["scheduled", "draft", "draft_private", "draft_public", "recurring"],
            description: "Post state (default: 'scheduled')",
          },
          media_ids: {
            type: "array",
            items: { type: "string" },
            description: "Media IDs from upload_media_file or upload_media_from_url",
          },
          follow_up_text: {
            type: "string",
            description: "An optional follow-up comment to post shortly after the main post.",
          },
          networks: {
            type: "object",
            description:
              "Advanced: raw per-platform networks object (overrides text/media_ids). " +
              "Keys: facebook, instagram, twitter, linkedin, pinterest, youtube, tiktok, " +
              "google, wordpress_basic, wordpress_oauth, telegram, mastodon, threads, bluesky, global",
          },
        },
      },
    },

    {
      name: "publish_post_now",
      description:
        "Publish a post immediately across one or more accounts. " +
        "Returns a job_id — poll get_job_status to confirm completion.",
      inputSchema: {
        type: "object",
        required: ["account_ids", "text"],
        properties: {
          account_ids: {
            type: "array",
            items: { type: "string" },
            description: "Account IDs to post to",
          },
          text: {
            type: "string",
            description: "Post caption / text",
          },
          media_ids: {
            type: "array",
            items: { type: "string" },
            description: "Media IDs to attach",
          },
          follow_up_text: {
            type: "string",
            description: "An optional follow-up comment to post shortly after the main post.",
          },
          networks: {
            type: "object",
            description: "Advanced: raw per-platform networks object",
          },
        },
      },
    },

    {
      name: "delete_post",
      description: "Delete a post by ID",
      inputSchema: {
        type: "object",
        required: ["post_id"],
        properties: {
          post_id: { type: "string", description: "The post ID to delete" },
        },
      },
    },

    // ── Jobs ───────────────────────────────────────────────────────────────
    {
      name: "get_job_status",
      description:
        "Check the status of an asynchronous Publer job (post creation, media upload, etc.). " +
        "Poll this after schedule_post, publish_post_now, or upload_media_from_url.",
      inputSchema: {
        type: "object",
        required: ["job_id"],
        properties: {
          job_id: { type: "string", description: "Job ID returned by an async operation" },
        },
      },
    },

    // ── Media ──────────────────────────────────────────────────────────────
    {
      name: "list_media",
      description: "List media assets in the workspace media library",
      inputSchema: {
        type: "object",
        properties: {
          types: {
            type: "array",
            items: { type: "string", enum: ["photo", "video", "gif"] },
            description: "Filter by media type(s)",
          },
          used: {
            type: "array",
            items: { type: "boolean" },
            description: "Filter by usage status (true = used in a post, false = unused)",
          },
          source: {
            type: "array",
            items: {
              type: "string",
              enum: ["canva", "vista", "postnitro", "contentdrips", "openai", "favorites", "upload"],
            },
            description: "Filter by upload source",
          },
          ids: {
            type: "array",
            items: { type: "string" },
            description: "Retrieve specific media items by ID",
          },
          search: {
            type: "string",
            description: "Full-text search on name or caption",
          },
          page: {
            type: "number",
            description: "Page number (0-based, default 0)",
          },
        },
      },
    },

    {
      name: "upload_media_from_url",
      description:
        "Upload one or more media files to the workspace library from public URLs. " +
        "Returns a job_id — poll get_job_status to retrieve the resulting media IDs.",
      inputSchema: {
        type: "object",
        required: ["media"],
        properties: {
          media: {
            type: "array",
            description: "List of media items to upload",
            items: {
              type: "object",
              required: ["url", "name"],
              properties: {
                url: { type: "string", description: "Publicly accessible URL of the file" },
                name: { type: "string", description: "Display name for the asset" },
                caption: { type: "string", description: "Optional caption" },
                source: { type: "string", description: "Optional source label" },
              },
            },
          },
          in_library: {
            type: "boolean",
            description: "Save to the media library (default: true)",
          },
          direct_upload: {
            type: "boolean",
            description: "Upload directly to cloud storage",
          },
        },
      },
    },

    {
      name: "upload_media_file",
      description:
        "Upload a local file to the workspace media library. " +
        "Provide an absolute path to a file on the machine running this MCP server. " +
        "Returns the media object with id, path, type, width, height.",
      inputSchema: {
        type: "object",
        required: ["file_path"],
        properties: {
          file_path: {
            type: "string",
            description: "Absolute path to the local file to upload (max 200 MB)",
          },
          in_library: {
            type: "boolean",
            description: "Save to the media library (default: true)",
          },
          direct_upload: {
            type: "boolean",
            description: "Upload directly to cloud storage",
          },
        },
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Users ────────────────────────────────────────────────────────────
      case "get_current_user": {
        const res = await getBaseClient().get("/users/me");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      // ── Workspaces ───────────────────────────────────────────────────────
      case "list_workspaces": {
        const res = await getBaseClient().get("/workspaces");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      // ── Accounts ─────────────────────────────────────────────────────────
      case "list_accounts": {
        const res = await getClient().get("/accounts");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      // ── Posts ────────────────────────────────────────────────────────────
      case "list_posts": {
        const a = args ?? {};
        const params: Record<string, unknown> = {};
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
        const body: Record<string, unknown> = {};
        if (a.text) body.caption = a.text;
        if (a.scheduled_at) body.scheduled_at = a.scheduled_at;
        if (a.account_ids) body.account_ids = a.account_ids;
        if (a.label_ids) body.label_ids = a.label_ids;
        if (a.media_ids) {
          body.media = (a.media_ids as string[]).map(id => ({ id }));
        }

        const res = await getClient().put(`/posts/${a.post_id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "list_labels": {
        const res = await getClient().get("/labels");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "get_post_insights": {
        const { account_id, from, to } = args! as { account_id?: string; from: string; to: string };
        const path = account_id ? `/analytics/${account_id}/post_insights` : "/analytics/post_insights";
        const res = await getClient().get(path, { params: { from, to } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "get_best_times": {
        const { account_id } = args! as { account_id?: string };
        const path = account_id ? `/analytics/${account_id}/best_times` : "/analytics/best_times";
        const res = await getClient().get(path);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "schedule_post": {
        const body = buildScheduleBody(args as Record<string, unknown>, true);
        const res = await getClient().post("/posts/schedule", body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "publish_post_now": {
        const body = buildScheduleBody(args as Record<string, unknown>, false);
        const res = await getClient().post("/posts/schedule/publish", body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "delete_post": {
        await getClient().delete("/posts", { params: { "post_ids[]": [args!.post_id] } });
        return {
          content: [{ type: "text", text: `Post ${args!.post_id} deleted successfully.` }],
        };
      }

      // ── Jobs ─────────────────────────────────────────────────────────────
      case "get_job_status": {
        const res = await getClient().get(`/job_status/${args!.job_id}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      // ── Media ────────────────────────────────────────────────────────────
      case "list_media": {
        const a = args ?? {};
        const params: Record<string, unknown> = {};
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
        const body: Record<string, unknown> = { media: args!.media };
        if (args!.in_library !== undefined) body.in_library = args!.in_library;
        if (args!.direct_upload !== undefined) body.direct_upload = args!.direct_upload;

        const res = await getClient().post("/media/from-url", body);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      case "upload_media_file": {
        const filePath = args!.file_path as string;
        const resolved = path.resolve(filePath);

        if (!fs.existsSync(resolved)) {
          throw new Error(`File not found: ${resolved}`);
        }

        const form = new FormData();
        form.append("file", fs.createReadStream(resolved));
        if (args!.in_library !== undefined) form.append("in_library", String(args!.in_library));
        if (args!.direct_upload !== undefined) form.append("direct_upload", String(args!.direct_upload));

        const workspaceId = process.env.PUBLER_WORKSPACE_ID;
        const token = process.env.PUBLER_API_TOKEN;
        if (!token) throw new Error("PUBLER_API_TOKEN is not set.");
        if (!workspaceId) throw new Error("PUBLER_WORKSPACE_ID is not set.");

        const res = await axios.post(`${PUBLER_API_BASE}/media`, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer-API ${token}`,
            "Publer-Workspace-Id": workspaceId,
          },
          maxBodyLength: 210 * 1024 * 1024, // 210 MB
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    const message = axios.isAxiosError(err)
      ? `Publer API error ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : err instanceof Error
      ? err.message
      : String(err);

    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
