import type { HookHandler } from "openclaw";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNIPARA_BASE_URL = "https://api.snipara.com";

async function uploadToSnipara(apiKey: string, projectSlug: string, docId: string, content: string, metadata: Record<string, string> = {}) {
  const response = await fetch(`${SNIPARA_BASE_URL}/mcp/${projectSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "rlm_upload_document",
        arguments: {
          id: docId,
          content,
          metadata: { source: "openclaw-hook", ...metadata },
        },
      },
    }),
  });

  if (!response.ok) {
    console.error(`[snipara-memory-sync] Upload failed for ${docId}: ${response.status}`);
    return false;
  }
  return true;
}

async function rememberSummary(apiKey: string, projectSlug: string, content: string) {
  const response = await fetch(`${SNIPARA_BASE_URL}/mcp/${projectSlug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "rlm_remember",
        arguments: {
          content,
          type: "fact",
          category: "session-memory",
          ttl_days: 30,
        },
      },
    }),
  });
  return response.ok;
}

const handler: HookHandler = async (event) => {
  if (event.type !== "command") return;
  if (!["new", "stop", "reset"].includes(event.action)) return;

  const apiKey = process.env.SNIPARA_API_KEY;
  const projectSlug = process.env.SNIPARA_PROJECT_SLUG;
  if (!apiKey || !projectSlug) {
    console.log("[snipara-memory-sync] Missing SNIPARA_API_KEY or SNIPARA_PROJECT_SLUG");
    return;
  }

  const workspaceDir = event.context?.workspaceDir;
  if (!workspaceDir) {
    console.log("[snipara-memory-sync] No workspace dir");
    return;
  }

  const filesToSync = [
    { path: "MEMORY.md", id: "openclaw-memory" },
    { path: "TOOLS.md", id: "openclaw-tools" },
    { path: "memory/infra-vutler.md", id: "openclaw-infra-vutler" },
  ];

  // Add today's daily file
  const today = new Date().toISOString().slice(0, 10);
  filesToSync.push({
    path: `memory/${today}.md`,
    id: `openclaw-daily-${today}`,
  });

  let synced = 0;
  for (const file of filesToSync) {
    try {
      const fullPath = join(workspaceDir, file.path);
      const content = readFileSync(fullPath, "utf-8");
      if (content.trim().length === 0) continue;

      const ok = await uploadToSnipara(apiKey, projectSlug, file.id, content, {
        file: file.path,
        syncedAt: new Date().toISOString(),
      });
      if (ok) synced++;
    } catch (err: any) {
      // File not found or read error — skip
      if (err.code !== "ENOENT") {
        console.error(`[snipara-memory-sync] Error reading ${file.path}:`, err.message);
      }
    }
  }

  // Also store a session summary as a memory
  const sessionSummary = `Session ${event.action} at ${new Date().toISOString()}. Synced ${synced} files to Snipara.`;
  await rememberSummary(apiKey, projectSlug, sessionSummary);

  console.log(`[snipara-memory-sync] Synced ${synced}/${filesToSync.length} files to Snipara on /${event.action}`);
  event.messages.push(`🧠 Memory synced to Snipara (${synced} files)`);
};

export default handler;
