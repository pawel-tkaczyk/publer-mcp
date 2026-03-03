/**
 * Platform constraints for the Publer Social Manager.
 * These limits are used for sanity checks and thread splitting.
 */

export interface PlatformConfig {
  name: string;
  charLimit: number;
  mediaLimit: number;
  supportsThreading: boolean;
  supportedMediaTypes: string[];
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  facebook: {
    name: "Facebook",
    charLimit: 63206,
    mediaLimit: 10,
    supportsThreading: false,
    supportedMediaTypes: ["photo", "video", "gif"],
  },
  instagram: {
    name: "Instagram",
    charLimit: 2200,
    mediaLimit: 10,
    supportsThreading: false,
    supportedMediaTypes: ["photo", "video"],
  },
  twitter: {
    name: "X (Twitter)",
    charLimit: 280,
    mediaLimit: 4,
    supportsThreading: true,
    supportedMediaTypes: ["photo", "video", "gif"],
  },
  linkedin: {
    name: "LinkedIn",
    charLimit: 3000,
    mediaLimit: 9,
    supportsThreading: false,
    supportedMediaTypes: ["photo", "video", "gif"],
  },
  mastodon: {
    name: "Mastodon",
    charLimit: 500,
    mediaLimit: 4,
    supportsThreading: true,
    supportedMediaTypes: ["photo", "video", "gif"],
  },
  threads: {
    name: "Threads",
    charLimit: 500,
    mediaLimit: 10,
    supportsThreading: true,
    supportedMediaTypes: ["photo", "video", "gif"],
  },
  tiktok: {
    name: "TikTok",
    charLimit: 2200,
    mediaLimit: 1, // video only
    supportsThreading: false,
    supportedMediaTypes: ["video"],
  },
  pinterest: {
    name: "Pinterest",
    charLimit: 500,
    mediaLimit: 1,
    supportsThreading: false,
    supportedMediaTypes: ["photo", "video"],
  },
  youtube: {
    name: "YouTube",
    charLimit: 5000,
    mediaLimit: 1,
    supportsThreading: false,
    supportedMediaTypes: ["video"],
  },
  telegram: {
    name: "Telegram",
    charLimit: 4096,
    mediaLimit: 10,
    supportsThreading: false,
    supportedMediaTypes: ["photo", "video", "gif"],
  },
};

/**
 * Normalizes common network strings used in the API to our internal keys.
 */
export function normalizePlatform(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("facebook")) return "facebook";
  if (n.includes("instagram")) return "instagram";
  if (n.includes("twitter") || n === "x") return "twitter";
  if (n.includes("linkedin")) return "linkedin";
  if (n.includes("mastodon")) return "mastodon";
  if (n.includes("threads")) return "threads";
  if (n.includes("tiktok")) return "tiktok";
  if (n.includes("pinterest")) return "pinterest";
  if (n.includes("youtube")) return "youtube";
  if (n.includes("telegram")) return "telegram";
  return n;
}
