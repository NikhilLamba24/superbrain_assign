# StorySync — Design & Reasoning Document

## 1. Product Overview

StorySync is a collaborative AI storyboard MVP: two (or more) users claim temporary usernames, join a seeded project, see each other's live editing presence, generate FLUX image variations per scene with Together AI, and maintain per-user version history. The goal is a **complete collaborative product loop** — presence, generation, persistence, versioning, and realtime delivery — rather than a full image editor.

## 2. Why This Architecture

### 2.1 Next.js (frontend) + FastAPI (backend) split

- **FastAPI owns all business logic.** Sessions, generation, versioning, deletion consent — everything lives in Python services behind thin route handlers. The frontend is a thin client.
- **Next.js for the UI.** Server rendering for the shell, client components for the interactive workspace, typed API client, and realtime subscriptions.
- **Why not a single Next.js server?** The assignment explicitly required a Python backend, and a Python API layer is cleaner for the heavy, long-running Together AI calls (server-side key handling, timeouts, retries). Keeping the secret-holding layer in Python also makes the security story obvious.

### 2.2 Supabase as the managed backend

- **PostgreSQL** — relational model fits projects/scenes/versions/sessions perfectly; foreign keys and indexes give integrity and fast lookups.
- **Storage** — image persistence with public URLs, no custom upload service.
- **Realtime** — `postgres_changes` subscriptions give presence, scene, and version updates with **zero custom WebSocket infrastructure**. This was the single biggest scope-saver: the PRD's realtime requirements (presence, current scene, new version) map directly onto DB change events.
- **RLS + anon key**: the browser subscribes with the public anon key (read-only policies); all writes go through the service-role key on the backend only. No server-only secret ever reaches the browser.

### 2.3 Why not CRDT / custom sockets / Redis

The MVP is collaborative at the **project/scene level**, not pixel level. Users work on different scenes; when they share a scene they get a non-blocking warning. Immutable image versions sidestep conflict resolution entirely. Custom WebSockets and CRDTs would add infrastructure and complexity with zero MVP benefit.

## 3. Feature Decisions and Rationale

### 3.1 Temporary username / sessions (no auth)

- **Decision:** usernames are temporary identities. Join checks a collision, heartbeat keeps the session alive (client sends every 10s), a session expires after 60s of silence, and the username becomes free again.
- **Why:** the product is a demo loop, not an account system. Passwords/OAuth/JWT would add friction with no product value, and heartbeat+expiry is the most reliable way to handle users who close tabs without ceremony.
- **Robustness details:** tab-close `pagehide` beacon for immediate leave (heartbeat expiry is the fallback source of truth); a 401 triggers a silent rejoin so a backgrounded tab doesn't dump the user back to the username screen; presence is also polled every second so expiry reflects within ~1s.

### 3.2 Project creation + admin + consent-based deletion

- **Decision:** the creator of a project becomes its admin; seeded projects get an admin on first join. Only the admin can request deletion. If co-contributors exist (anyone who generated an image), deletion requires their consent via a popup (red cross = reject, green tick = approve).
- **Why:** deletion is destructive and irreversible — a single user should never be able to destroy others' work. The consent popup surfaces the trade-off to every stakeholder before the admin can act, and the admin sees per-user responses ("X has work progress" / "X is okay with the deletion"). This is a lightweight, humane permission model that fits a demo without building a full roles/permissions system.
- **Why per-user version numbers:** every generation is an immutable version (`blackhorse_v1`, `blackhorse_v2`…). This gives free undo/history per user, matches the PRD exactly, and avoids merge/branch complexity.

### 3.3 Image generation (Together AI)

- **Decision:** server-side only. Browser → FastAPI → Together AI → download → Supabase Storage → version record → realtime broadcast.
- **Why server-side:** the API key must never reach the browser. The service handles timeouts, non-200 responses, invalid JSON, and download failures gracefully (typed errors → friendly UI messages). Model is `black-forest-labs/FLUX.2-dev` per the provided curl, with a `TOGETHER_MOCK` flag for local dev without burning credits.
- **Why download-then-upload:** Together returns a short-lived signed URL; persisting the bytes to our own public bucket makes versions durable and independently cacheable.

### 3.4 Realtime presence and updates

- **Decision:** three `postgres_changes` subscriptions (active_sessions for presence; scenes UPDATE and image_versions INSERT for content), plus a 1s presence poll.
- **Why both:** realtime gives instant updates while both clients are connected; the poll catches edge cases realtime can miss (session expiry without a delete event, connection drops) and keeps the collaborator count accurate within ~1s.
- **Why the poll is cheap:** a dedicated lightweight `/presence` endpoint returns only collaborators, not the whole project.

### 3.5 Resilience choices (lessons from real failures)

- **Single-flight refresh:** multiple realtime events used to launch concurrent `getProject` calls, which exceeded the browser's per-origin connection limit and caused intermittent "Cannot reach the server" flashes. Coalescing to one in-flight request fixed it.
- **No infinite loading:** a failed initial load now shows a Retry button; a stale saved session (project deleted) falls back to the username screen.
- **Cross-project isolation:** image-version realtime events are filtered by the current project's scenes, so work in one project never churns another tab.

## 4. Security

- Together API key + Supabase service-role key: backend-only, never in `NEXT_PUBLIC_*`.
- Browser uses only the public anon key with read-only RLS policies.
- CORS locked to the frontend origin.
- Env examples committed; real values only in gitignored `.env`/`.env.local`.

## 5. Testing & Verification

- Backend pytest suite: unit tests (health, version numbering, generation service) + end-to-end API flow (two-browser join/heartbeat/generate/versions) + full consent-deletion flow.
- Frontend: TypeScript strict, ESLint, `next build`.
- Live verification: real FLUX.2-dev generation persisted to cloud storage; realtime delivery confirmed via a two-subscriber simulation script; two-browser manual workflow.

## 6. Deployment

- Frontend: Next.js on Vercel (root dir `frontend`).
- Backend: FastAPI on Vercel Python serverless (root dir `backend`, `maxDuration: 90`, entrypoint `app/main.py`).
- Supabase: cloud project with migrations 0001 + 0002 and seed applied.
- Environment variables documented in `.env.example` files for both sides.

## 7. Known Limitations & Next Steps

- No authentication (by design — temporary identity).
- Version numbering assumes sequential generations; a concurrent double-generate can race (unique constraint guards duplicates).
- No chat, comments, or image editing (out of MVP scope).
- Future ideas: activity broadcast ("X is generating…"), per-project access control, and a proper persistence layer for large histories.
