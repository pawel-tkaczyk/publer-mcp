# Publer MCP Enhancement Plan

This document outlines the strategy and tasks for implementing advanced social media management features in the Publer MCP server.

## 1. Feature Roadmap

### 🧵 Intelligent Thread Splitter
- **Goal**: Automatically split long-form content into platform-optimized threads.
- **Tool**: `split_content_into_thread(text, platform)`
- **Logic**: Use `platform_limits.md` to determine max character counts (e.g., 280 for X, 500 for Mastodon). Support smart breaking at sentences/paragraphs.

### ✅ Post Sanity Check
- **Goal**: Validate posts against platform constraints before submission.
- **Tool**: `validate_post(text, account_ids, media_ids?)`
- **Checks**: Character counts, media count limits, allowed media types per platform.

### 📦 Bulk Scheduling
- **Goal**: Support Publer's native bulk API for high-volume scheduling.
- **Tool**: `schedule_posts_bulk(posts: Array<{ text, account_ids, scheduled_at, ... }>)`
- **Benefit**: Reduces API overhead and allows for planning entire campaigns in one go.

### 🏷️ Global Account Presets
- **Goal**: Group social accounts into reusable labels (e.g., "Product", "Personal").
- **Storage**: A local configuration file (`~/.publer/presets.json`).
- **Tools**: `manage_account_presets(action: 'list' | 'create' | 'delete', name?, account_ids?)`.
- **Integration**: Update `schedule_post` to resolve preset names to account IDs.

### 🧹 Media Cleanup & Organization
- **Goal**: Keep the Publer library tidy.
- **Tools**: 
  - `list_unused_media()`: Find assets not attached to any post.
  - `cleanup_media(ids: string[])`: Bulk delete assets.
  - `organize_media(ids: string[], folder: string)`: (If supported by API) Move to folders.

### 📥 Approval Queue Management
- **Goal**: Streamline team workflows.
- **Tools**:
  - `list_pending_posts()`: Show posts in "draft" or "awaiting approval" states.
  - `review_post(post_id, action: 'approve' | 'reject', feedback?)`.

---

## 2. Implementation Tasks

### Phase 1: Core Logic & Validation
- [ ] Create a `constants.ts` or `platforms.ts` to centralize platform limits.
- [ ] Implement `validate_post` tool logic.
- [ ] Implement `split_content_into_thread` utility and tool.

### Phase 2: Configuration & Presets
- [ ] Set up local file storage for account presets.
- [ ] Implement `manage_account_presets` tool.
- [ ] Update scheduling tools to support `@preset_name` in `account_ids`.

### Phase 3: Bulk & Workflow
- [ ] Implement `schedule_posts_bulk` using the `/posts/bulk` endpoint.
- [ ] Add `list_pending_posts` and `review_post` tools.

### Phase 4: Maintenance
- [ ] Add `list_unused_media` (filtering `list_media` results).
- [ ] Add `cleanup_media` for bulk deletion.

---

## 3. Getting Started
We will begin by establishing the **Platform Constraints Logic** (Phase 1) as it serves as the foundation for the splitter and the sanity check.
