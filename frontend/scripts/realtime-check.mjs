/**
 * Verifies Supabase Realtime delivers the events the StorySync frontend relies on:
 *  - active_sessions changes (presence: join/leave/scene change)
 *  - scenes UPDATE (new current version)
 *  - image_versions INSERT
 *
 * Usage (from frontend/):
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... API_URL=... node scripts/realtime-check.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.SUPABASE_ANON_KEY;
const apiUrl = process.env.API_URL ?? "http://localhost:8000";
const PROJECT = "project_blueocean";

if (!anonKey) {
  console.error("SUPABASE_ANON_KEY is required");
  process.exit(2);
}

const sb = createClient(url, anonKey);
const username = `rt_check_${Date.now()}`;
const scene1 = "10000000-0000-4000-8000-000000000006";
const scene2 = "10000000-0000-4000-8000-000000000007";

const events = [];
const expected = [
  `presence:${username}:INSERT`, // join
  `presence:${username}:UPDATE`, // heartbeat scene change
  "scenes:UPDATE", // scene current version after generation
  "versions:INSERT", // image_versions row after generation
  "presence:DELETE", // leave (realtime delivers id-only old row under RLS)
];

function post(path, body) {
  return fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

const channel = sb
  .channel(`rt-check-${username}`)
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "active_sessions", filter: `project_id=eq.${PROJECT}` },
    (payload) => {
      const row = payload.new ?? payload.old;
      // DELETE events carry only the row id (replica identity + RLS), so match
      // the table-level filter rather than the username for deletes.
      if (payload.eventType === "DELETE") {
        events.push("presence:DELETE");
        return;
      }
      if (row?.username !== username) return;
      events.push(`presence:${username}:${payload.eventType.toUpperCase()}`);
    },
  )
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "scenes" }, () => {
    events.push("scenes:UPDATE");
  })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "image_versions" }, () => {
    events.push("versions:INSERT");
  })
  .subscribe();

const timeout = setTimeout(() => {
  console.error("TIMEOUT waiting for realtime events");
  console.error("received:", JSON.stringify(events));
  console.error("expected:", JSON.stringify(expected));
  process.exit(1);
}, 30000);

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Wait for subscription to be established.
await wait(3000);

// 1. Join (INSERT on active_sessions).
const join = await post("/api/sessions/join", { username, projectId: PROJECT });
if (join.status !== 200) throw new Error(`join failed: ${JSON.stringify(join.body)}`);
const sessionId = join.body.sessionId;

// 2. Scene change (UPDATE on active_sessions).
await wait(1500);
await post("/api/sessions/heartbeat", { sessionId, sceneId: scene1 });
await wait(1500);
await post("/api/sessions/heartbeat", { sessionId, sceneId: scene2 });

// 3. Generate an image (scenes UPDATE + image_versions INSERT).
await wait(1500);
const gen = await post(`/api/scenes/${scene2}/generate`, {
  username,
  prompt: "realtime verification",
});
if (gen.status !== 200) throw new Error(`generate failed: ${JSON.stringify(gen.body)}`);

// 4. Leave (DELETE on active_sessions).
await wait(1500);
const leave = await post("/api/sessions/leave", { sessionId });
console.error("leave status:", leave.status, JSON.stringify(leave.body));

await wait(2000);
clearTimeout(timeout);

const missing = expected.filter((e) => !events.includes(e));
if (missing.length > 0) {
  console.error("MISSING realtime events:", missing.join(", "));
  console.error("received:", JSON.stringify(events));
  process.exit(1);
}
console.log("REALTIME OK - all events received:");
console.log(events.map((e) => `  ${e}`).join("\n"));
await sb.removeChannel(channel);
process.exit(0);
