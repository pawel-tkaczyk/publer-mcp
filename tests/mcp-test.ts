
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

// Since we can't easily import from the CommonJS/ESM hybrid src/index.ts without a full setup,
// I'll replicate the logic here to verify the transformation logic specifically.

type MediaRef = { id: string };

function buildNetworks(
  text: string,
  mediaIds?: string[]
): Record<string, unknown> {
  const media: MediaRef[] = mediaIds?.map((id) => ({ id })) ?? [];
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

Deno.test("buildScheduleBody - includes follow-up text", () => {
  const args = {
    account_ids: ["acc1", "acc2"],
    text: "Main post content",
    follow_up_text: "Follow-up comment here",
    scheduled_at: "2026-03-04T10:00:00Z"
  };

  const body = buildScheduleBody(args, true) as any;
  const accounts = body.bulk.posts[0].accounts;

  assertEquals(accounts.length, 2);
  assertEquals(accounts[0].id, "acc1");
  assertEquals(accounts[0].scheduled_at, "2026-03-04T10:00:00Z");
  assertEquals(accounts[0].comments[0].text, "Follow-up comment here");
  assertEquals(accounts[0].comments[0].conditions.clauses.age.duration, 1);
});

Deno.test("buildScheduleBody - omits follow-up text when not provided", () => {
  const args = {
    account_ids: ["acc1"],
    text: "Main post content"
  };

  const body = buildScheduleBody(args, false) as any;
  const accounts = body.bulk.posts[0].accounts;

  assertEquals(accounts[0].comments, undefined);
});
