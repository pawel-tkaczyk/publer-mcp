# Platform Limits & Optimization

Use these limits and guidelines when adapting content for different social networks.

## Character & Media Limits

| Platform | Text Limit | Hashtag Limit | Media Support | Threading |
| :--- | :--- | :--- | :--- | :--- |
| **X (Twitter)** | 280 chars | 2-3 recommended | 4 images, 1 video | Yes (Posts) |
| **Threads** | 500 chars | No formal limit | 10 images/videos | Yes (Posts) |
| **Mastodon** | 500 chars* | No formal limit | 4 images, 1 video | Yes (Posts) |
| **LinkedIn** | 3,000 chars | 3-5 recommended | 9 images, 1 video | No (Comment only) |
| **Facebook** | 63,206 chars | 2-3 recommended | 10+ images, 1 video | No (Comment only) |
| **Instagram** | 2,200 chars | 30 max | 10 images (Carousel) | No |
| **BlueSky** | 300 chars | No formal limit | 4 images | Yes (Posts) |

*Note: Some Mastodon instances have higher limits (up to 5000), but 500 is the safe default.*

## Content Adaptation Rules

### 1. Long-form to Short-form (X, BlueSky)
- **Summarize**: Extract the hook and the main takeaway.
- **Thread Splitting**: If the content is essential, split into a thread of 3-7 posts.
- **Link Placement**: Put links in the first or last post of a thread.

### 2. Professional (LinkedIn)
- **Formatting**: Use bullet points and line breaks.
- **CTA**: Always include a clear Call-to-Action.
- **Follow-up**: Suggest a follow-up comment for "Link in bio" or "Join the discussion".

### 3. Visual-First (Instagram, TikTok)
- **Captions**: Keep the first 125 characters high-impact.
- **Hashtags**: Use a mix of broad and niche tags.

## Follow-up Comment (Threading) Support

Publer supports `follow_up_text` which is handled differently per platform:
- **Threaded (Thread created)**: X, Threads, Mastodon, BlueSky.
- **Commented (Comment added)**: Facebook Pages, LinkedIn.
- **Not Supported**: Pinterest, TikTok, Google Business.
