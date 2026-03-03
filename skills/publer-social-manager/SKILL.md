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
1.  **Draft content**: Create platform-specific versions based on [platform_limits.md](references/platform_limits.md).
2.  **Adapt**: Automatically shorten for X/Threads/Mastodon or expand for LinkedIn.
3.  **Propose**: Present all versions for user approval before scheduling.

### 2. Thread Creation & Follow-up
For long-form content or when a follow-up is needed:
-   **Threads**: Propose splitting text into a numbered thread for X, Threads, or Mastodon.
-   **Follow-up**: Use `follow_up_text` in `schedule_post` for "Link in bio" comments or to start a discussion.

### 3. Smart Scheduling
-   **Optimal Time**: If the user is vague (e.g., "post tomorrow"), first use `get_best_times` for the selected account(s) to pick the perfect slot.
-   **Conflict Resolution**: Use `list_posts` to ensure no overlapping content is scheduled.

### 4. Media Handling
-   **Upload first**: If local media is provided, use `upload_media_file` to get a `media_id` before calling `schedule_post`.
-   **URLs**: For web-based media, use `upload_media_from_url`.

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
