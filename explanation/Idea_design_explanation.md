# StorySync — Design Notes (the "why" behind the build)

**Useful links**
- Live demo: [superbrain-assign.vercel.app](https://superbrain-assign.vercel.app/)
- Source code: [github.com/NikhilLamba24/superbrain_assign](https://github.com/NikhilLamba24/superbrain_assign)
- Walkthrough video: [Watch the explanation](https://drive.google.com/file/d/19kDqRvqkkk7RT10jashCDGZChpk7-ICV/view?usp=sharing)

## 1. What we built

StorySync is a small collaborative AI storyboard. The idea: a couple of people hop into a project, claim a username (no accounts, no passwords), see who else is around and which scene they're on, and generate AI image variations per scene. Every generation becomes a permanent, named version — `blackhorse_v1`, `blackhorse_v2`, and so on — so nothing ever gets overwritten and the history is always there to look back at.

It's deliberately not a full image editor. The point was to prove out a complete loop — presence, generation, persistence, versioning, and live updates landing in other people's browsers — and make that loop feel solid, not to build the most feature-packed tool.

## 2. Why this architecture

### 2.1 Next.js on the front, FastAPI on the back

- **The backend (FastAPI, Python) owns the logic.** Joining a project, checking a username is free, generating an image, tracking versions, and the consent-based delete flow all live in Python service modules behind thin route handlers. The frontend just talks to those routes — it's a thin client, not a second brain.
- **The frontend (Next.js) handles the UI.** Server-rendered shell, interactive client components for the workspace, a typed API client, and realtime subscriptions.
- **Why not everything in one Next.js server?** The assignment asked for a Python backend, and honestly a Python API layer is the right home for the heavy Together AI calls anyway — long-running requests, server-side key handling, timeouts, retries. It also makes the security story simple to explain: the layer that holds secrets is the layer that never ships to a browser.

### 2.2 Supabase as the managed backend

- **PostgreSQL** — projects, scenes, versions, and sessions map to tables very naturally, and foreign keys plus indexes keep lookups fast and data consistent.
- **Storage** — generated images go to a public bucket with plain URLs; no custom upload service to maintain.
- **Realtime** — this was the single biggest time-saver. Supabase's `postgres_changes` gives us presence, scene, and version updates with **zero custom WebSocket code**. The PRD's realtime asks (who's here, what scene they're on, a new version landed) are literally just database change events.
- **RLS + anon key** — the browser subscribes using the public anon key with read-only policies; every write goes through the backend's service-role key. Nothing server-only ever touches the browser.

See the [database schema](https://github.com/NikhilLamba24/superbrain_assign/blob/master/architecture_demonstration/04_database_schema.mmd) for how these tables fit together.

### 2.3 Why no CRDTs, custom sockets, or Redis

Collaboration here is at the **project and scene level**, not pixel level. People work on different scenes; if two people land on the same scene they just get a friendly heads-up. Immutable image versions mean there's no merge conflict to resolve. Adding WebSockets or CRDTs would have been infrastructure and complexity with zero payoff for this MVP.

See the [system architecture diagram](https://github.com/NikhilLamba24/superbrain_assign/blob/master/architecture_demonstration/01_system_architecture.mmd) for how the two browsers, the frontend, the backend, Together AI, and Supabase all connect.

## 3. Feature decisions and the reasoning behind them

### 3.1 Temporary usernames (no auth)

- **What:** usernames are temporary identities. Joining checks the name isn't already taken, a heartbeat keeps the session alive (the browser pings every 10s), a session expires after 60s of silence, and the name frees back up.
- **Why:** this is a demo loop, not an account system. Passwords/OAuth/JWT would add friction and ship nothing the product needs. Heartbeat + expiry is also the most dependable way to handle people who just close a tab.
- **Resilience details:** closing a tab fires a `pagehide` beacon to leave immediately (expiry is the fallback if that doesn't happen); a backgrounded tab that comes back to a 401 silently rejoins instead of kicking the user to the username screen; presence is also polled every second so an expired user drops off within about a second.

See the [core user flow](https://github.com/NikhilLamba24/superbrain_assign/blob/master/architecture_demonstration/02_core_user_flow.mmd) for the full join → heartbeat → generate → realtime loop.

### 3.2 Project creation, admin, and consent-based deletion

- **What:** the person who creates a project is its admin; a seeded project gets an admin the first time someone joins it. Only the admin can ask to delete a project, and if anyone else ever generated an image in it, the admin needs their consent. The co-contributor gets a popup with a red cross (reject) and a green tick (approve).
- **Why:** deleting a project is destructive and permanent — one person shouldn't be able to wipe out other people's work on a whim. The popup puts the trade-off in front of everyone who has a stake, and the admin sees each answer ("X has work progress here and doesn't want to delete" / "X is okay with the deletion"). It's a light, human permission model that fits a demo without building a full roles system. A single "no" cancels the request outright, so the popup stops pestering everyone else immediately.
- **Why per-user version numbers:** every generation is an immutable version, so each user gets free undo/history, the PRD gets exactly what it asked for, and we skip merge/branch complexity entirely.

See the [consent-based deletion flow](https://github.com/NikhilLamba24/superbrain_assign/blob/master/architecture_demonstration/03_consent_based_deletion.mmd) for how the admin request and the red-cross/green-tick responses play out.

### 3.3 Image generation (Together AI)

- **What:** generation is server-side only: browser → FastAPI → Together AI → download the image → upload to Supabase Storage → write a version record → realtime broadcast.
- **Why server-side:** the API key must never reach the browser. The service handles timeouts, bad responses, and download failures and turns them into friendly UI messages. The model is `black-forest-labs/FLUX.2-dev` (from the provided curl), and there's a `TOGETHER_MOCK` flag so local dev doesn't burn credits.
- **Why download-then-upload:** Together hands back a short-lived signed URL; saving the bytes into our own public bucket keeps versions durable and cacheable.

### 3.4 Realtime presence and updates

- **What:** three `postgres_changes` subscriptions (active sessions for presence; scene updates and new versions for content) plus a 1s presence poll.
- **Why both:** realtime gives instant updates while everyone is connected; the poll catches the edge cases realtime can miss (a session expiring without a delete event, a dropped connection) and keeps the "N collaborators" count honest to within a second.
- **Why the poll is cheap:** a dedicated lightweight `/presence` endpoint returns only the collaborator list, not the whole project.

### 3.5 Resilience lessons from real bugs

- **One request at a time:** too many realtime events used to fire overlapping `getProject` calls, which blew past the browser's per-origin connection limit and produced random "Cannot reach the server" flashes. Coalescing to a single in-flight refresh fixed it.
- **No dead-end loading:** a failed initial load now shows a Retry button, and a stale saved session (project no longer exists) drops back to the username screen instead of spinning forever.
- **Project isolation:** image-version realtime events are filtered by the current project's scenes, so work happening in another project never churns your tab.

## 4. Security

- Together API key and the Supabase service-role key live only on the backend — never in a `NEXT_PUBLIC_*` variable.
- The browser only ever sees the public anon key with read-only RLS policies.
- CORS is locked to the frontend origin.
- Example env files are committed; real values only exist in gitignored `.env`/`.env.local`.

## 5. Testing and verification

- Backend pytest suite: unit tests (health, version numbering, the generation service), an end-to-end API flow (two-browser join/heartbeat/generate/versions), and a full consent-deletion flow.
- Frontend: strict TypeScript, ESLint, and a clean `next build`.
- Live checks: real FLUX.2-dev generation persisted to cloud storage, realtime delivery confirmed with a two-subscriber script, and a manual two-browser walkthrough.

## 6. Deployment

- Frontend: Next.js on Vercel (root directory `frontend`).
- Backend: FastAPI on Vercel's Python serverless runtime (root directory `backend`, `maxDuration: 90`, entrypoint `app/main.py`).
- Supabase: a cloud project with migrations 0001 and 0002 plus the seed applied.
- Environment variables are documented in the `.env.example` files on both sides.

Try the live app at [superbrain-assign.vercel.app](https://superbrain-assign.vercel.app/) — full source is on [GitHub](https://github.com/NikhilLamba24/superbrain_assign).

## 7. Known limitations and where it could go next

- No authentication — intentional; identity is temporary for the session.
- Version numbering assumes generations happen one after another; a rare simultaneous double-generate could race (a unique constraint guards against duplicates).
- No chat, comments, or image editing — all out of MVP scope.
- Ideas for later: an activity broadcast ("X is generating…"), per-project access control, and a richer layer for long version histories.
