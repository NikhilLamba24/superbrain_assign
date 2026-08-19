/**
 * Simulates the PRD's two-browser Definition of Done using two independent
 * Supabase realtime subscribers (browser A and browser B) and the real API.
 *
 *   A: whiterabbit -> project_blueocean, Scene 1
 *   B: blackhorse  -> project_blueocean, Scene 2
 *   B generates two images; A sees scene updates + blackhorse presence.
 *   A moves to another scene; B sees the presence update.
 *
 * Usage (from frontend/): SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/two-browser-check.mjs
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

const scene1 = "10000000-0000-4000-8000-000000000006"; // Opening
const scene2 = "10000000-0000-4000-8000-000000000007"; // Discovery
const scene3 = "10000000-0000-4000-8000-000000000008"; // Conflict
const userA = `whiterabbit_${Date.now()}`;
const userB = `blackhorse_${Date.now()}`;

const sbA = createClient(url, anonKey);
const sbB = createClient(url, anonKey);

const aPresence = new Map();
const bPresence = new Map();
let aSceneUpdates = 0;
let bSceneUpdates = 0;

function subscribePresence(sb, map) {
  return sb
    .channel(`presence-${Date.now()}-${Math.random()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "active_sessions", filter: `project_id=eq.${PROJECT}` },
      async () => {
        const project = await fetch(`${apiUrl}/api/projects/${PROJECT}`).then((r) => r.json());
        for (const c of project.activeCollaborators) map.set(c.username, c.sceneName);
        for (const key of [...map.keys()]) {
          if (!project.activeCollaborators.some((c) => c.username === key)) map.delete(key);
        }
      },
    )
    .subscribe();
}

function subscribeScenes(sb, counter) {
  return sb
    .channel(`scenes-${Date.now()}-${Math.random()}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "scenes" }, () => counter())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "image_versions" }, () => counter())
    .subscribe();
}

function post(path, body) {
  return fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

await subscribePresence(sbA, aPresence);
await subscribePresence(sbB, bPresence);
subscribeScenes(sbA, () => aSceneUpdates++);
subscribeScenes(sbB, () => bSceneUpdates++);
await wait(3000);

// Browser A: whiterabbit joins, selects Scene 1.
const joinA = await post("/api/sessions/join", { username: userA, projectId: PROJECT });
if (joinA.status !== 200) fail(`A join: ${JSON.stringify(joinA.body)}`);
await post("/api/sessions/heartbeat", { sessionId: joinA.body.sessionId, sceneId: scene1 });

// Browser B: whiterabbit must be rejected.
const dup = await post("/api/sessions/join", { username: userA, projectId: PROJECT });
if (dup.status !== 409) fail(`expected 409 for duplicate username, got ${dup.status}`);

// Browser B: blackhorse joins, selects Scene 2.
const joinB = await post("/api/sessions/join", { username: userB, projectId: PROJECT });
if (joinB.status !== 200) fail(`B join: ${JSON.stringify(joinB.body)}`);
await post("/api/sessions/heartbeat", { sessionId: joinB.body.sessionId, sceneId: scene2 });

await wait(2500);

// Both browsers see both collaborators.
if (aPresence.get(userA) !== "Opening" || aPresence.get(userB) !== "Discovery") {
  fail(`A presence wrong: ${JSON.stringify([...aPresence])}`);
}
if (bPresence.get(userA) !== "Opening" || bPresence.get(userB) !== "Discovery") {
  fail(`B presence wrong: ${JSON.stringify([...bPresence])}`);
}
console.log("PRESENCE OK (both browsers):", userA, "-> Opening,", userB, "-> Discovery");

// Browser B generates two images on Scene 2.
for (let i = 0; i < 2; i++) {
  const gen = await post(`/api/scenes/${scene2}/generate`, {
    username: userB,
    prompt: `two-browser variation ${i + 1}`,
  });
  if (gen.status !== 200) fail(`generate: ${JSON.stringify(gen.body)}`);
  await wait(1200);
}

if (aSceneUpdates < 2 || bSceneUpdates < 2) {
  fail(`scene updates missing: A=${aSceneUpdates} B=${bSceneUpdates}`);
}
console.log("SCENE UPDATE OK (both browsers received image updates)");

// Browser B's versions + scene current version.
const versions = await fetch(`${apiUrl}/api/scenes/${scene2}/versions`).then((r) => r.json());
const bVersions = versions.filter((v) => v.createdBy === userB);
if (bVersions.length < 2 || bVersions[0].versionNumber !== bVersions[1].versionNumber + 1) {
  fail(`version numbering wrong: ${JSON.stringify(bVersions.map((v) => v.versionNumber))}`);
}
console.log("VERSIONING OK:", bVersions.map((v) => v.displayVersion).join(", "));

// Browser A moves to another scene; B sees the presence update.
await post("/api/sessions/heartbeat", { sessionId: joinA.body.sessionId, sceneId: scene3 });
await wait(2500);
if (bPresence.get(userA) !== "Conflict") {
  fail(`B did not see A move to Conflict: ${JSON.stringify([...bPresence])}`);
}
console.log("PRESENCE MOVE OK (B saw A move to Conflict)");

// Cleanup.
await post("/api/sessions/leave", { sessionId: joinA.body.sessionId });
await post("/api/sessions/leave", { sessionId: joinB.body.sessionId });
console.log("TWO-BROWSER CHECK PASSED");
process.exit(0);
