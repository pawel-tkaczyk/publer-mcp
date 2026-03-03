#!/usr/bin/env node
/**
 * Publer MCP — Interactive setup wizard
 *
 * Guides the user through:
 *  1. Obtaining and validating a Publer API token
 *  2. Obtaining and validating a Publer Workspace ID
 *  3. Building the server (tsc)
 *  4. Registering the server in one or more agent configs:
 *       - Claude Code  (~/.claude/settings.json)
 *       - Claude Desktop (platform-specific)
 *       - OpenAI Codex (~/.codex/config.json)
 *       - Gemini CLI   (~/.gemini/settings.json)
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import axios from "axios";

const PUBLER_API_BASE = "https://app.publer.com/api/v1";

// ── Colours ───────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const magenta = (s: string) => `${c.magenta}${s}${c.reset}`;

function banner() {
  console.log(
    `
${cyan("╔══════════════════════════════════════════════════╗")}
${cyan("║")}    ${bold("Publer MCP — Setup Wizard")}                      ${cyan("║")}
${cyan("║")}    ${dim("Connect Publer to your AI coding agent")}         ${cyan("║")}
${cyan("╚══════════════════════════════════════════════════╝")}
`
  );
}

function step(n: number, total: number, title: string) {
  console.log(`\n${cyan(`[${n}/${total}]`)} ${bold(title)}`);
  console.log(cyan("─".repeat(52)));
}

function ok(msg: string) { console.log(`  ${green("✓")} ${msg}`); }
function warn(msg: string) { console.log(`  ${yellow("⚠")} ${msg}`); }
function fail(msg: string) { console.log(`  ${red("✗")} ${msg}`); }
function info(msg: string) { console.log(`  ${cyan("›")} ${msg}`); }

// ── Filesystem helpers ────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── Agent config writers ──────────────────────────────────────────────────────

interface McpEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

function buildEntry(serverPath: string, token: string, workspaceId: string): McpEntry {
  return {
    command: "node",
    args: [serverPath],
    env: {
      PUBLER_API_TOKEN: token,
      PUBLER_WORKSPACE_ID: workspaceId,
    },
  };
}

function installClaudeCode(entry: McpEntry): string {
  const filePath = path.join(os.homedir(), ".claude", "settings.json");
  const cfg = readJson(filePath) as Record<string, unknown> & { mcpServers?: Record<string, unknown> };
  cfg.mcpServers = cfg.mcpServers ?? {};
  (cfg.mcpServers as Record<string, unknown>)["publer"] = entry;
  writeJson(filePath, cfg);
  return filePath;
}

function claudeDesktopConfigPath(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "win32":
      return path.join(process.env.APPDATA ?? os.homedir(), "Claude", "claude_desktop_config.json");
    default:
      return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
  }
}

function installClaudeDesktop(entry: McpEntry): string {
  const filePath = claudeDesktopConfigPath();
  const cfg = readJson(filePath) as Record<string, unknown> & { mcpServers?: Record<string, unknown> };
  cfg.mcpServers = cfg.mcpServers ?? {};
  (cfg.mcpServers as Record<string, unknown>)["publer"] = entry;
  writeJson(filePath, cfg);
  return filePath;
}

function installCodex(entry: McpEntry): string {
  const filePath = path.join(os.homedir(), ".codex", "config.json");
  const cfg = readJson(filePath) as Record<string, unknown> & { mcpServers?: Record<string, unknown> };
  cfg.mcpServers = cfg.mcpServers ?? {};
  (cfg.mcpServers as Record<string, unknown>)["publer"] = entry;
  writeJson(filePath, cfg);
  return filePath;
}

function installGemini(entry: McpEntry): string {
  const filePath = path.join(os.homedir(), ".gemini", "settings.json");
  const cfg = readJson(filePath) as Record<string, unknown> & { mcpServers?: Record<string, unknown> };
  cfg.mcpServers = cfg.mcpServers ?? {};
  (cfg.mcpServers as Record<string, unknown>)["publer"] = entry;
  writeJson(filePath, cfg);
  return filePath;
}

// ── Publer validation helpers ─────────────────────────────────────────────────

async function validateToken(token: string): Promise<boolean> {
  try {
    await axios.get(`${PUBLER_API_BASE}/workspaces`, {
      headers: { Authorization: `Bearer-API ${token}` },
      timeout: 8000,
    });
    return true;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) return false;
    return true; // network error — don't block setup
  }
}

interface Workspace {
  id: string;
  name: string;
}

async function fetchWorkspaces(token: string): Promise<Workspace[]> {
  try {
    const res = await axios.get(`${PUBLER_API_BASE}/workspaces`, {
      headers: { Authorization: `Bearer-API ${token}` },
      timeout: 8000,
    });
    const data = res.data;
    if (Array.isArray(data)) return data as Workspace[];
    if (Array.isArray(data?.workspaces)) return data.workspaces as Workspace[];
    return [];
  } catch {
    return [];
  }
}

async function validateWorkspaceId(token: string, workspaceId: string): Promise<boolean> {
  try {
    await axios.get(`${PUBLER_API_BASE}/accounts`, {
      headers: {
        Authorization: `Bearer-API ${token}`,
        "Publer-Workspace-Id": workspaceId,
      },
      timeout: 8000,
    });
    return true;
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
      return false;
    }
    return true; // network error — don't block setup
  }
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;
const SERVER_JS_PATH = new URL(import.meta.url).pathname;
const BUILT_SERVER = SERVER_JS_PATH
  .replace("/src/setup.js", "/dist/index.js")
  .replace("/src/setup.ts", "/dist/index.js");

async function main() {
  banner();

  const rl = createInterface({ input, output });

  // ── Step 1 — API token ──────────────────────────────────────────────────────
  step(1, TOTAL_STEPS, "Publer API Token");
  console.log(`
  To get your token:
  ${cyan("1.")} Open ${bold("https://app.publer.io")} and log in
  ${cyan("2.")} Go to ${bold("Profile → Settings → API")}
  ${cyan("3.")} Click ${bold('"Generate Token"')} and copy it
`);

  let token = "";
  while (!token) {
    token = (await rl.question("  Paste your Publer API token: ")).trim();
    if (!token) { warn("Token cannot be empty."); continue; }

    info("Validating token against Publer API…");
    const valid = await validateToken(token);
    if (valid) {
      ok("Token accepted!");
    } else {
      fail("Token was rejected (401 Unauthorized).");
      warn("Double-check you copied the full token.");
      const retry = await rl.question("  Try again? [Y/n] ");
      if (retry.toLowerCase() === "n") { fail("Aborting setup."); process.exit(1); }
      token = "";
    }
  }

  // ── Step 2 — Workspace ID ───────────────────────────────────────────────────
  step(2, TOTAL_STEPS, "Publer Workspace ID");

  // Try to fetch workspaces and present them to the user
  info("Fetching your workspaces…");
  const workspaces = await fetchWorkspaces(token);
  let workspaceId = "";

  if (workspaces.length > 0) {
    console.log(`\n  ${bold("Your workspaces:")}`);
    workspaces.forEach((ws, i) => {
      console.log(`  ${cyan(`[${i + 1}]`)} ${bold(ws.name.padEnd(30))} ${dim(ws.id)}`);
    });
    console.log();

    const pick = (await rl.question(`  Enter a number to select, or paste a Workspace ID directly: `)).trim();
    const n = parseInt(pick, 10);

    if (!isNaN(n) && n >= 1 && n <= workspaces.length) {
      workspaceId = workspaces[n - 1].id;
      ok(`Selected workspace: ${bold(workspaces[n - 1].name)} (${workspaceId})`);
    } else {
      workspaceId = pick;
    }
  } else {
    console.log(`
  To find your Workspace ID:
  ${cyan("1.")} Look at your Publer URL: ${bold("app.publer.io/workspaces/{id}/...")}
  ${cyan("2.")} Or check Settings → Workspace → General
`);
    workspaceId = (await rl.question("  Paste your Workspace ID: ")).trim();
  }

  if (!workspaceId) {
    fail("Workspace ID cannot be empty. Aborting.");
    rl.close();
    process.exit(1);
  }

  // Validate workspace ID if not already confirmed by selection
  if (workspaces.length === 0 || !workspaces.find((ws) => ws.id === workspaceId)) {
    info("Validating Workspace ID…");
    const valid = await validateWorkspaceId(token, workspaceId);
    if (valid) {
      ok("Workspace ID accepted!");
    } else {
      warn("Could not validate Workspace ID (got 401/403). Continuing anyway — double-check the value.");
    }
  }

  // ── Step 3 — Build the server ───────────────────────────────────────────────
  step(3, TOTAL_STEPS, "Build MCP server");
  const projectRoot = path.resolve(path.dirname(SERVER_JS_PATH), "..");

  info("Running `npm install` …");
  try {
    execSync("npm install", { stdio: "inherit", cwd: projectRoot });
    ok("Dependencies installed.");
  } catch {
    warn("npm install failed — you may need to run it manually.");
  }

  info("Running `npm run build` (tsc) …");
  try {
    execSync("npm run build", { stdio: "inherit", cwd: projectRoot });
    ok(`Server compiled → ${dim(BUILT_SERVER)}`);
  } catch {
    warn("Build failed — run `npm run build` manually before using the server.");
  }

  // ── Step 4 — Choose agents ──────────────────────────────────────────────────
  step(4, TOTAL_STEPS, "Select agents to configure");

  const agents = [
    { id: "claude-code",    label: "Claude Code",        description: "CLI agent by Anthropic" },
    { id: "claude-desktop", label: "Claude Desktop",     description: "Desktop app by Anthropic" },
    { id: "codex",          label: "OpenAI Codex CLI",   description: "OpenAI's terminal agent" },
    { id: "gemini",         label: "Gemini CLI",         description: "Google's terminal agent" },
  ];

  console.log();
  agents.forEach((a, i) => {
    console.log(`  ${cyan(`[${i + 1}]`)} ${bold(a.label.padEnd(20))} ${dim(a.description)}`);
  });
  console.log(`  ${cyan("[5]")} ${bold("All of the above")}`);
  console.log();

  const raw = await rl.question("  Enter numbers separated by commas (e.g. 1,3): ");
  const picks = new Set<string>();
  raw.split(",").forEach((part) => {
    const n = parseInt(part.trim(), 10);
    if (n === 5) agents.forEach((a) => picks.add(a.id));
    else if (n >= 1 && n <= 4) picks.add(agents[n - 1].id);
  });

  if (picks.size === 0) {
    warn("No agents selected — you can re-run setup at any time.");
    rl.close();
    return;
  }

  // ── Step 5 — Write configs ──────────────────────────────────────────────────
  step(5, TOTAL_STEPS, "Writing agent configuration");
  const entry = buildEntry(BUILT_SERVER, token, workspaceId);

  const installed: Array<{ label: string; path: string }> = [];
  const failed: Array<{ label: string; err: string }> = [];

  async function tryInstall(label: string, fn: () => string) {
    try {
      const p = fn();
      ok(`${bold(label)} → ${dim(p)}`);
      installed.push({ label, path: p });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`${bold(label)}: ${msg}`);
      failed.push({ label, err: msg });
    }
  }

  if (picks.has("claude-code"))    await tryInstall("Claude Code",    () => installClaudeCode(entry));
  if (picks.has("claude-desktop")) await tryInstall("Claude Desktop", () => installClaudeDesktop(entry));
  if (picks.has("codex"))          await tryInstall("OpenAI Codex",   () => installCodex(entry));
  if (picks.has("gemini"))         await tryInstall("Gemini CLI",     () => installGemini(entry));

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`
${cyan("═".repeat(52))}
${bold("  Setup complete!")}
${cyan("═".repeat(52))}
`);

  if (installed.length) {
    console.log(bold("  Configured agents:"));
    installed.forEach(({ label, path: p }) => {
      console.log(`  ${green("✓")} ${label}`);
      console.log(`    ${dim(p)}`);
    });
    console.log();
  }

  if (failed.length) {
    console.log(bold("  Failed (fix manually):"));
    failed.forEach(({ label, err }) => {
      console.log(`  ${red("✗")} ${label}: ${err}`);
    });
    console.log();
  }

  console.log(bold("  Available MCP tools (11):"));
  [
    ["get_current_user",       "Get authenticated user profile"],
    ["list_workspaces",        "List all workspaces"],
    ["list_accounts",          "List connected social accounts"],
    ["list_posts",             "List/filter posts"],
    ["schedule_post",          "Schedule a post (async → job_id)"],
    ["publish_post_now",       "Publish immediately (async → job_id)"],
    ["delete_post",            "Delete a post"],
    ["get_job_status",         "Poll an async job"],
    ["list_media",             "List media library assets"],
    ["upload_media_from_url",  "Upload media from URL (async → job_id)"],
    ["upload_media_file",      "Upload a local file"],
  ].forEach(([name, desc]) => {
    console.log(`    ${magenta("·")} ${bold(name!.padEnd(26))} ${dim(desc!)}`);
  });

  console.log(`
  ${dim("Restart your agent(s) to pick up the new MCP server.")}
  ${dim("Re-run `npm run setup` at any time to rotate token, change workspace, or add agents.")}
`);

  rl.close();
}

main().catch((err) => {
  console.error(red(`\nFatal: ${err instanceof Error ? err.message : err}`));
  process.exit(1);
});
