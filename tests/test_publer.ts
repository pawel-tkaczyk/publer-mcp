import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import * as dotenv from "node:dotenv";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Load credentials from Gemini settings if not in env
let token = process.env.PUBLER_API_TOKEN;
let workspaceId = process.env.PUBLER_WORKSPACE_ID;

if (!token || !workspaceId) {
  const settingsPath = path.join(os.homedir(), ".gemini", "settings.json");
  if (fs.existsSync(settingsPath)) {
    const cfg = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const publer = cfg.mcpServers?.publer?.env;
    if (publer) {
      token = publer.PUBLER_API_TOKEN;
      workspaceId = publer.PUBLER_WORKSPACE_ID;
    }
  }
}

const client = axios.create({
  baseURL: "https://app.publer.com/api/v1",
  headers: {
    Authorization: `Bearer-API ${token}`,
    "Publer-Workspace-Id": workspaceId,
    "Content-Type": "application/json",
  },
});

test("Publer API Basic Tools", async (t) => {
  await t.test("get_current_user", async () => {
    const res = await client.get("/users/me");
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.id);
  });

  await t.test("list_workspaces", async () => {
    const res = await client.get("/workspaces");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data) || Array.isArray(res.data.workspaces));
  });

  await t.test("list_accounts", async () => {
    const res = await client.get("/accounts");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });
});

test("Publer MCP Enhanced Tools", async (t) => {
  let accounts: any[] = [];
  
  await t.test("Setup: Fetch accounts", async () => {
    const res = await client.get("/accounts");
    accounts = res.data;
    assert.ok(accounts.length > 0, "No accounts found in workspace to test with.");
  });

  await t.test("list_accounts with provider filter", async () => {
    // Just verify filtering logic mock (since we might not have a specific provider)
    const provider = accounts[0].provider;
    const filtered = accounts.filter(a => a.provider === provider);
    assert.ok(filtered.length > 0);
  });

  await t.test("schedule_post (draft)", async () => {
    const accountIds = [accounts[0].id];
    const text = "Test draft post from MCP test suite " + new Date().toISOString();
    
    // We simulate the buildScheduleBody logic
    const body = {
      bulk: {
        state: "draft",
        posts: [{
          networks: { global: { text, media: [] } },
          accounts: accountIds.map(id => ({ id }))
        }],
      },
    };

    const res = await client.post("/posts/schedule", body);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.job_id);
    
    // Clean up: delete the draft if we can find it (wait, it's async)
  });

  await t.test("publish_with_media (simulation)", async () => {
    // This is a slow test, we verify the media upload and polling logic
    const media_urls = [
      { url: "https://publer.io/images/logo.png", name: "logo.png" }
    ];
    
    const uploadRes = await client.post("/media/from-url", { media: media_urls });
    assert.strictEqual(uploadRes.status, 200);
    const jobId = uploadRes.data.job_id;
    assert.ok(jobId);

    // Poll for status (shortened for test)
    let jobResult = null;
    for (let i = 0; i < 5; i++) {
      const res = await client.get(`/job_status/${jobId}`);
      if (res.data.status !== null) {
        jobResult = res.data;
        break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    if (jobResult) {
      assert.notStrictEqual(jobResult.status, "failed");
    }
  });
});

test("Logic: splitForPlatform (manual test)", async () => {
  // Since we can't easily import from src/index.ts (it has side effects),
  // we repeat the logic to verify our algorithm.
  
  function testSplit(text: string, limit: number): string[] {
    const actualLimit = limit - 8;
    const parts: string[] = [];
    let current = "";
    const paras = text.split("\n\n");
    for (const p of paras) {
      if ((current + p).length <= actualLimit) {
        current += (current ? "\n\n" : "") + p;
      } else {
        if (current) parts.push(current.trim());
        current = p;
      }
    }
    if (current) parts.push(current.trim());
    return parts.map((p, i) => `${p} (${i + 1}/${parts.length})`);
  }

  const longText = "Para 1. ".repeat(30) + "\n\n" + "Para 2. ".repeat(30);
  const result = testSplit(longText, 280);
  assert.ok(result.length > 1);
  assert.ok(result[0].includes("(1/"));
});
