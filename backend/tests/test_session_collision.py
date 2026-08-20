"""Regression tests for username collision / session-stealing.

Covers the bug where two users could hold the same username in parallel:
join() previously deleted ALL sessions for a username (including an active
one) before inserting, letting a second browser steal a live session and
start a rejoin-steal loop.

Requires a running backend (uvicorn app.main:app) and the Supabase it points
at (env-driven, local fallback).
"""

import json
import os
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from supabase import create_client

BASE = "http://localhost:8000"
SUPA_URL = os.getenv("SUPABASE_URL", "http://127.0.0.1:54321")
SUPA_SERVICE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6"
    "InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
)


def post(path: str, payload: dict) -> tuple[int, dict]:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def test_second_join_with_active_username_is_rejected() -> None:
    """Two joins of the same active username: the second must get 409 — never a
    second session (the session-stealing bug)."""
    username = f"collide_{int(time.time())}"
    status, first = post(
        "/api/sessions/join", {"username": username, "projectId": "project_blueocean"}
    )
    assert status == 200, first

    try:
        status, second = post(
            "/api/sessions/join",
            {"username": username, "projectId": "project_blueocean"},
        )
        assert status == 409, f"expected 409, got {status}: {second}"
        assert second["code"] == "session_conflict"

        # The first session is untouched and still valid.
        status, hb = post(
            "/api/sessions/heartbeat",
            {"sessionId": first["sessionId"], "sceneId": None},
        )
        assert status == 200, hb
    finally:
        post("/api/sessions/leave", {"sessionId": first["sessionId"]})


def test_expired_username_can_be_reclaimed() -> None:
    """A stale session (past the TTL) must not block a new join — the PRD says a
    username becomes available again after its session expires."""
    sb = create_client(SUPA_URL, SUPA_SERVICE_KEY)
    username = f"stale_{int(time.time())}"
    session_id = str(uuid.uuid4())
    stale_time = (
        datetime.now(timezone.utc) - timedelta(seconds=3600)
    ).isoformat()
    sb.table("active_sessions").insert(
        {
            "id": session_id,
            "username": username,
            "project_id": "project_blueocean",
            "scene_id": None,
            "last_seen_at": stale_time,
            "created_at": stale_time,
        }
    ).execute()

    try:
        status, resp = post(
            "/api/sessions/join", {"username": username, "projectId": "project_blueocean"}
        )
        assert status == 200, resp
        assert resp["sessionId"] != session_id
    finally:
        post("/api/sessions/leave", {"sessionId": session_id})
