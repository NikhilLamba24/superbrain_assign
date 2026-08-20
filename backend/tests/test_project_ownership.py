"""End-to-end project ownership + consent-based deletion flow.

Requires a running backend (uvicorn app.main:app) pointed at a Supabase with
migrations 0001 + 0002 applied, and TOGETHER_MOCK=true.
"""

import json
import os
import time
import urllib.error
import urllib.request
import uuid

from supabase import create_client

BASE = "http://localhost:8000"

# Supabase (service role) that the backend is pointed at — used to seed a scene
# into the newly-created project so the contributor can generate inside it.
# Falls back to the local dev stack when no env vars are set.
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


def get(path: str) -> dict | list:
    with urllib.request.urlopen(BASE + path, timeout=30) as resp:
        return json.loads(resp.read())


def test_project_ownership_and_consent_deletion() -> None:
    stamp = int(time.time())
    admin = f"admin_{stamp}"
    contrib = f"contrib_{stamp}"

    # 1. Admin creates a project and becomes its creator/admin.
    status, created = post("/api/projects", {"username": admin, "name": f"Test {stamp}"})
    assert status == 200, created
    project_id = created["id"]
    assert created["createdBy"] == admin

    project = get(f"/api/projects/{project_id}")
    assert project["createdBy"] == admin

    # 2. Seed a scene into the new project so the contributor can generate.
    sb = create_client(SUPA_URL, SUPA_SERVICE_KEY)
    scene_id = str(uuid.uuid4())
    sb.table("scenes").insert(
        {
            "id": scene_id,
            "project_id": project_id,
            "title": "Scene 1",
            "position": 1,
        }
    ).execute()

    # 3. Contributor joins and generates an image -> becomes a contributor.
    status, j = post("/api/sessions/join", {"username": contrib, "projectId": project_id})
    assert status == 200, j
    post("/api/sessions/heartbeat", {"sessionId": j["sessionId"], "sceneId": scene_id})
    # Contributor needs an active session on the scene to generate.
    status, gen = post(
        f"/api/scenes/{scene_id}/generate",
        {"username": contrib, "prompt": "contributor work"},
    )
    assert status == 200, gen

    # 4. Non-admin cannot request deletion.
    status, _ = post(f"/api/projects/{project_id}/delete/request", {"username": contrib})
    assert status == 403

    # 5. Admin requests deletion -> pending (contributor must consent).
    status, req = post(f"/api/projects/{project_id}/delete/request", {"username": admin})
    assert status == 200, req
    assert req["status"] == "pending"
    assert contrib in req["contributors"]

    st = get(f"/api/projects/{project_id}/delete/status")
    assert st["status"] == "pending"
    assert st["requestedBy"] == admin

    # 6. Contributor rejects (red cross) -> cancelled, project still exists.
    status, vote = post(
        f"/api/projects/{project_id}/delete/vote",
        {"username": contrib, "approve": False},
    )
    assert status == 200, vote
    assert vote["status"] == "rejected"

    st = get(f"/api/projects/{project_id}/delete/status")
    assert st["status"] == "rejected"
    assert st["responses"][0]["approved"] is False
    project = get(f"/api/projects/{project_id}")
    assert project["id"] == project_id

    # 7. Admin requests again; contributor approves (green tick) -> deleted.
    status, req = post(f"/api/projects/{project_id}/delete/request", {"username": admin})
    assert status == 200, req
    assert req["status"] == "pending"

    status, vote = post(
        f"/api/projects/{project_id}/delete/vote",
        {"username": contrib, "approve": True},
    )
    assert status == 200, vote
    assert vote["status"] == "deleted"

    # Project is gone.
    st = get(f"/api/projects/{project_id}/delete/status")
    assert st["status"] == "deleted"
    ids = [p["id"] for p in get("/api/projects")]
    assert project_id not in ids

    # 7. Immediate delete when the admin has no co-contributors.
    project2 = post("/api/projects", {"username": admin, "name": f"Solo {stamp}"})[1]
    status, req = post(
        f"/api/projects/{project2['id']}/delete/request", {"username": admin}
    )
    assert status == 200, req
    assert req["status"] == "deleted"
    assert req["contributors"] == []

    # Clean up the contributor's session.
    post("/api/sessions/leave", {"sessionId": j["sessionId"]})


def test_one_rejection_cancels_request_immediately() -> None:
    """A single denial must cancel the deletion request right away, even when
    other contributors have not yet voted — later arrivals must NOT see the
    consent popup for an already-rejected request."""
    stamp = int(time.time())
    admin = f"admin2_{stamp}"
    contrib_a = f"ca_{stamp}"
    contrib_b = f"cb_{stamp}"

    _, created = post("/api/projects", {"username": admin, "name": f"Multi {stamp}"})
    project_id = created["id"]

    sb = create_client(SUPA_URL, SUPA_SERVICE_KEY)
    scene_id = str(uuid.uuid4())
    sb.table("scenes").insert(
        {"id": scene_id, "project_id": project_id, "title": "Scene 1", "position": 1}
    ).execute()

    sessions = []
    try:
        for contrib in (contrib_a, contrib_b):
            status, j = post(
                "/api/sessions/join", {"username": contrib, "projectId": project_id}
            )
            assert status == 200, j
            sessions.append(j["sessionId"])
            post("/api/sessions/heartbeat", {"sessionId": j["sessionId"], "sceneId": scene_id})
            status, gen = post(
                f"/api/scenes/{scene_id}/generate",
                {"username": contrib, "prompt": "work"},
            )
            assert status == 200, gen

        # Admin requests deletion: both contributors must consent.
        _, req = post(f"/api/projects/{project_id}/delete/request", {"username": admin})
        assert req["status"] == "pending"
        assert set(req["contributors"]) == {contrib_a, contrib_b}

        # Contributor A rejects while contributor B has NOT voted.
        status, vote = post(
            f"/api/projects/{project_id}/delete/vote",
            {"username": contrib_a, "approve": False},
        )
        assert status == 200, vote
        assert vote["status"] == "rejected"

        # The request is rejected immediately: a later arrival must not see a
        # pending popup.
        st = get(f"/api/projects/{project_id}/delete/status")
        assert st["status"] == "rejected"
        assert st["responses"][0]["approved"] is False

        # Project still exists.
        assert get(f"/api/projects/{project_id}")["id"] == project_id
    finally:
        for sid in sessions:
            post("/api/sessions/leave", {"sessionId": sid})
