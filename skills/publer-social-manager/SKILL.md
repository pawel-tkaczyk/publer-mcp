---
name: publer-social-manager
description: Manage and optimize social media posts via Publer. Use when you need to schedule, adapt content for multiple platforms (X, Mastodon, Threads, LinkedIn, etc.), create threads, or automate posting times based on audience activity.
---

# Publer Social Manager

## Overview
This skill provides high-level workflows for multi-platform social media management using the Publer MCP server. It streamlines content adaptation, multi-step scheduling, and performance monitoring.

## Core Workflows

### 1. Multi-Platform Campaign Planning
When asked to post across different networks:
1.  **Discovery**: Use `get_platform_info` to quickly see all connected accounts and their specific limits.
2.  **Adaptation**: Use `auto_adapt: true` in `schedule_post` or `publish_post_now` to automatically handle character limits and threading for X, Threads, and Mastodon.
3.  **Propose**: Present the versions to the user (use `split_content_into_thread` if you need to show them the exact split beforehand).

### 2. Streamlined Media Publishing
For posts with media from URLs:
-   **One-Step**: Use `publish_with_media` to upload and publish/schedule in a single call. This tool handles the background upload and polling automatically.
-   **Local Media**: Use `upload_media_file` for local files to get a `media_id` before calling `schedule_post`.

### 3. Thread Creation & Follow-up
-   **Auto-Threading**: Set `auto_adapt: true` to let the server handle splitting long content into numbered threads.
-   **Manual Follow-up**: Use `follow_up_text` in `schedule_post` for a specific "Link in bio" comment or to start a discussion.

### 4. Smart Scheduling
-   **Optimal Time**: Use `get_best_times` to pick the perfect slot based on audience activity.
-   **Semantic Filtering**: Use `list_accounts(capability: 'video')` or `list_accounts(provider: 'twitter')` to quickly find relevant accounts without scanning a large list.

## Usage Examples

### "Schedule this to X and LinkedIn sometime tomorrow morning"
-   **Action**: `list_accounts` -> `get_best_times` -> Adapt text for X (280 chars) and LinkedIn -> `schedule_post`.

### "Post this long blog summary as a thread on Mastodon"
-   **Action**: Split text into ~500 char chunks -> `schedule_post` with the first chunk as `text` and subsequent chunks as `follow_up_text` (if single follow-up) or multiple scheduled posts.
-   *Note*: Publer's `follow_up_text` typically supports one comment. For longer threads, schedule separate posts.

### "How did my posts perform last week?"
-   **Action**: `get_post_insights` with `from` and `to` dates -> Summarize top-performing content and key metrics.

## Platform Reference
See [platform_limits.md](references/platform_limits.md) for character counts, media support, and threading capabilities.
