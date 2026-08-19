# StorySync — Collaborative AI Storyboard

A collaborative AI storyboard MVP: two users claim temporary usernames, join a
seeded project, see each other's live presence, and generate FLUX image
variations per scene with Together AI. Every generation creates an immutable,
per-user version (`blackhorse_v1`, `blackhorse_v2`, …) that stays accessible in
version history.

## Architecture

```text
Next.js / React frontend (frontend/)
        |
        | HTTP JSON (lib/api.ts)
        v
FastAPI Python backend (backend/)
        |
        +---- Together AI (FLUX.2-dev)
        |
        +---- Supabase (Postgres + Storage + Realtime)
```

- The backend owns all business logic and holds all secrets.
- Realtime presence + image updates use Supabase Realtime directly from the
  frontend (public anon key, read-only RLS). No custom WebSocket.
- Active collaborators also refresh every second via
  `GET /api/projects/{id}/presence`, so presence stays accurate within ~1s even
  when a session expires without a realtime event.

## Repository structure

```text
├── frontend/            Next.js 16 + React 19 + TypeScript + Tailwind
│   ├── app/             username → projects → workspace flow
│   ├── components/      SceneList, SceneView, PresenceBar, VersionHistory, …
│   ├── hooks/           usePresence, useSceneUpdates (Supabase Realtime)
│   └── lib/             typed API client, realtime client, session storage
├── backend/             FastAPI app (api/, services/, schemas/, core/, db/)
├── supabase/            migrations/0001_init.sql + seed.sql (reproducible schema)
└── product_prd.md       the PRD this MVP implements
```

## Running locally

Prerequisites: Node 20+, Python 3.11+, Docker Desktop (for Supabase).

### 1. Supabase

```bash
# one-time: download the supabase CLI (Windows: supabase_<ver>_windows_amd64.tar.gz)
supabase start          # boots Postgres, Storage, Realtime and applies migrations
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TOGETHER_API_KEY
uvicorn app.main:app --reload --port 8000
```

For local dev without a Together API key, set `TOGETHER_MOCK=true` — generation
returns a placeholder image but the full storage → version → realtime pipeline
still runs.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / ANON_KEY; NEXT_PUBLIC_API_URL
npm run dev                  # http://localhost:3000
```

## Environment variables

See `backend/.env.example` and `frontend/.env.example`.

| Variable | Where | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | backend + frontend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | backend only | Server writes (never exposed) |
| `SUPABASE_ANON_KEY` | frontend | Realtime subscriptions |
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | Realtime client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | Realtime client |
| `NEXT_PUBLIC_API_URL` | frontend | FastAPI base URL |
| `TOGETHER_API_KEY` | backend | Image generation (server-only) |
| `TOGETHER_IMAGE_MODEL` | backend | Model id (default `black-forest-labs/FLUX.2-dev`) |
| `SESSION_TTL_SECONDS` | backend | Session expiry (default `60`) |

## Database setup

Schema and seed data are reproducible from `supabase/`:

```bash
supabase db reset   # local: re-applies migrations + seed
# cloud: supabase link --project-ref <ref> && supabase db push && supabase db seed --file supabase/seed.sql
```

Creates: `users`, `projects`, `scenes`, `image_versions`, `active_sessions`,
the `scene-images` storage bucket, read-only RLS policies for anon realtime
subscriptions, and seeds two projects (`project_deepsea`, `project_blueocean`)
with five scenes each plus one placeholder version.

## Verification scripts

- `frontend/scripts/realtime-check.mjs` — asserts Supabase Realtime delivers the
  presence (join/leave/scene change), scene-update, and image-version events the
  frontend subscribes to.
- `frontend/scripts/two-browser-check.mjs` — simulates the PRD's two-browser
  workflow (presence, username collision, generation, versioning) with two
  independent realtime subscribers.

Both require the backend and Supabase to be running; see the header comments for
usage.

## Deployment

- **Frontend**: Vercel (standard Next.js project).
- **Backend**: Vercel Python serverless — FastAPI app at `backend/app/main.py`
  with `maxDuration: 90` in `backend/vercel.json`. Alternative: Dockerfile for a
  persistent server.

See `backend/README.md` for backend deployment steps.

## Security notes

- `TOGETHER_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are backend-only; never
  prefixed with `NEXT_PUBLIC_`.
- The frontend uses only the public anon key with read-only RLS policies.
- Sessions are temporary identity (heartbeat + 60s expiry), not accounts.

## Known limitations (MVP)

- No authentication, project creation, chat, or image editing (per PRD scope).
- Version numbering assumes sequential generations per user; a concurrent
  double-generate can race (unique constraint guards against duplicates).
- Seed images are placeholders; real images require a Together API key.
