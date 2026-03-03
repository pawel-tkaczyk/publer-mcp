# Publer MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that wraps the [Publer](https://app.publer.io) social media scheduling API, letting you manage posts from Claude Code, Claude Desktop, OpenAI Codex CLI, and Gemini CLI.

## Quick start

```bash
npm install
npm run setup   # interactive wizard
```

The wizard will:
1. Ask for your Publer API token and validate it live
2. Build the server (`tsc`)
3. Let you pick which agents to configure
4. Write the correct config file for each agent

## Getting your Publer API token

1. Log in at <https://app.publer.io>
2. **Profile → Settings → API**
3. Click **Generate Token** and copy the value

## Manual installation

If you prefer to configure agents by hand, build first:

```bash
npm run build
```

Then add the following snippet to each agent's config file, replacing the values:

```json
{
  "mcpServers": {
    "publer": {
      "command": "node",
      "args": ["/absolute/path/to/publer-mcp/dist/index.js"],
      "env": {
        "PUBLER_API_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Config file locations

| Agent | Config file |
|-------|-------------|
| Claude Code | `~/.claude/settings.json` |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Desktop (Linux) | `~/.config/Claude/claude_desktop_config.json` |
| OpenAI Codex CLI | `~/.codex/config.json` |
| Gemini CLI | `~/.gemini/settings.json` |

## Available tools

| Tool | Description |
|------|-------------|
| `list_workspaces` | List all workspaces |
| `list_accounts` | List connected social media accounts |
| `create_post` | Create / schedule a post (supports text, media, links, hashtags) |
| `list_posts` | List posts filtered by status and/or account |
| `get_post` | Get full details of a post by ID |
| `delete_post` | Delete a post |
| `get_analytics` | Fetch analytics for an account or post |

### Advanced Features

- **Follow-up Comments**: Tools like `schedule_post` and `publish_post_now` support a `follow_up_text` parameter. On platforms like X, Threads, and Mastodon, this automatically creates a **thread**. On Facebook and LinkedIn, it adds a **comment**.
- **Social Manager Skill**: This repository includes a specialized agent skill that handles platform-specific character limits, intelligent thread splitting, and optimal posting time selection.

## Development

```bash
npm run dev      # run with tsx (no build step)
npm run build    # compile to dist/
npm run setup    # re-run the wizard (e.g. to rotate token or add agents)
```
