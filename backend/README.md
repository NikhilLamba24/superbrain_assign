# StorySync backend — FastAPI

Python 3.12 FastAPI backend for the StorySync collaborative AI storyboard.

## Local development

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in values (see below)
uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/api/health` → `{"status": "ok"}`

## Environment variables

| Variable | Required | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side Supabase key (never expose to the browser) |
| `SUPABASE_STORAGE_BUCKET` | no | Storage bucket name (default `scene-images`) |
| `TOGETHER_API_KEY` | dev* | Together AI API key for image generation |
| `TOGETHER_IMAGE_MODEL` | no | Model id (default `black-forest-labs/FLUX.2-dev`) |
| `TOGETHER_MOCK` | no | `true` generates a local placeholder instead of calling Together AI |
| `SESSION_TTL_SECONDS` | no | Active-session expiry (default `120`) |
| `CORS_ORIGINS` | no | Comma-separated allowed origins (default `http://localhost:3000`) |

*`TOGETHER_API_KEY` is required unless `TOGETHER_MOCK=true`.

## Tests

```bash
.venv/bin/python -m pytest tests -q
```

## Deployment

### Vercel (serverless, recommended)

The repo root is a Vercel project. The backend is a FastAPI app at `backend/app/main.py`
(`app` at a supported entrypoint), deployed as a single Vercel Function:

1. Push this repo to GitHub.
2. In Vercel, import the repo.
3. Set the backend environment variables (the four above) in the project settings.
4. Configure the root directory as `backend` and the framework as `FastAPI`.
5. Deploy. `maxDuration` is set to 90s in `backend/vercel.json`.

### Persistent server (alternative)

```bash
docker build -t storysync-backend .
docker run -p 8000:8000 --env-file .env storysync-backend
```
