# Publer MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that wraps the [Publer](https://publer.com/paweltkaczyk) social media scheduling API, letting you manage posts from Claude Code, Claude Desktop, OpenAI Codex CLI, and Gemini CLI.

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

1. Log in at <https://publer.com/paweltkaczyk>
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
| `get_current_user` | Get the profile of the currently authenticated Publer user |
| `list_workspaces` | List all Publer workspaces the API token has access to |
| `list_accounts` | List all connected social media accounts in the current workspace |
| `list_posts` | List posts with optional filters (state, date range, etc.) |
| `get_post` | Retrieve a specific post by ID |
| `update_post` | Update an existing post's text, schedule, or media |
| `schedule_post` | Create a scheduled, draft, or recurring post across accounts |
| `publish_post_now` | Publish a post immediately across one or more accounts |
| `delete_post` | Delete a post by ID |
| `get_post_insights` | Get performance metrics for published posts |
| `get_best_times` | Get optimal posting times based on audience activity |
| `list_media` | List media assets in the workspace library |
| `upload_media_file` | Upload a local file to the media library |
| `upload_media_from_url`| Upload media from a public URL |
| `get_job_status` | Poll the status of an asynchronous job (e.g. post creation) |
| `get_social_manager_instructions` | Get high-level skill instructions and workflows |
| `split_content_into_thread` | Intelligently split long text for threads |
| `validate_post` | Check a post against platform constraints |
| `manage_account_presets` | List, create, or delete groups of accounts |
| `schedule_posts_bulk` | Schedule multiple posts in a single request |
| `cleanup_media` | Bulk delete media assets from the library |

### Advanced Features

- **Account Presets**: You can group multiple social media account IDs into a single label (e.g., `@product`). Once created via `manage_account_presets`, you can use `@label` in any `account_ids` field.
- **Follow-up Comments**: Tools like `schedule_post` and `publish_post_now` support a `follow_up_text` parameter. On platforms like X, Threads, and Mastodon, this automatically creates a **thread**. On Facebook and LinkedIn, it adds a **comment**.
- **Social Manager Skill**: This repository includes specialized agent instructions for handling platform-specific character limits, intelligent thread splitting, and optimal posting time selection.
    - **Gemini CLI**: Install as a native skill via `npm run setup`.
    - **Claude Code**: Setup automatically installs these as a native skill to `.claude/skills/publer-social-manager/`.
    - **All Agents**: Can access instructions by calling the `get_social_manager_instructions` tool.

## Development

```bash
npm run dev      # run with tsx (no build step)
npm run build    # compile to dist/
npm run setup    # re-run the wizard (e.g. to rotate token or add agents)
```
