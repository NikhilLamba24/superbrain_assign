"""End-to-end API flow test against a running backend (requires local Supabase).

The backend must be running (uvicorn app.main:app) with SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY pointed at the local Supabase stack, and
TOGETHER_MOCK=true so generation does not need a Together API key.

The test uses unique usernames per run so it is repeatable: session
collisions and version numbering are asserted relative to the fresh names.
"""

import json
import threading
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8000"

SCENE_OPENING = "10000000-0000-4000-8000-000000000006"  # Blue Ocean, Scene 1
SCENE_DISCOVERY = "10000000-0000-4000-8000-000000000007"  # Blue Ocean, Scene 2

USER_A = f"whiterabbit_{int(time.time())}"
USER_B = f"blackhorse_{int(time.time())}"


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


def test_two_browser_flow() -> None:
    # Browser A: user A joins project_blueocean on Scene 1.
    status, resp_a = post(
        "/api/sessions/join",
        {"username": USER_A, "projectId": "project_blueocean"},
    )
    assert status == 200
    status, _ = post(
        "/api/sessions/heartbeat",
        {"sessionId": resp_a["sessionId"], "sceneId": SCENE_OPENING},
    )
    assert status == 200

    # Browser B: the same username must collide.
    status, dup = post(
        "/api/sessions/join",
        {"username": USER_A, "projectId": "project_blueocean"},
    )
    assert status == 409
    assert dup["code"] == "session_conflict"

    # Browser B: user B joins on Scene 2.
    status, resp_b = post(
        "/api/sessions/join",
        {"username": USER_B, "projectId": "project_blueocean"},
    )
    assert status == 200
    status, _ = post(
        "/api/sessions/heartbeat",
        {"sessionId": resp_b["sessionId"], "sceneId": SCENE_DISCOVERY},
    )
    assert status == 200

    # Background heartbeat thread mirrors the frontend's ~10s heartbeat so the
    # 30s session TTL does not expire while cloud generations run (~10s each).
    stop = threading.Event()

    def keepalive() -> None:
        while not stop.is_set():
            time.sleep(8)
            for sid, scene_id in (
                (resp_a["sessionId"], SCENE_OPENING),
                (resp_b["sessionId"], SCENE_DISCOVERY),
            ):
                post("/api/sessions/heartbeat", {"sessionId": sid, "sceneId": scene_id})

    thread = threading.Thread(target=keepalive, daemon=True)
    thread.start()

    # Presence shows both users on their scenes.
    project = get("/api/projects/project_blueocean")
    collabs = sorted(
        (c["username"], c["sceneName"]) for c in project["activeCollaborators"]
    )
    assert (USER_A, "Opening") in collabs
    assert (USER_B, "Discovery") in collabs

    # Existing version count for user B on Scene 2 (from earlier runs).
    existing = get(f"/api/scenes/{SCENE_DISCOVERY}/versions")
    base = sum(1 for v in existing if v["createdBy"] == USER_B)

    # user B generates two versions on Scene 2.
    generated: list[str] = []
    for i in range(2):
        status, gen = post(
            f"/api/scenes/{SCENE_DISCOVERY}/generate",
            {"username": USER_B, "prompt": f"Underwater city variation {i + 1}"},
        )
        assert status == 200, gen
        generated.append(gen["displayVersion"])

    assert generated == [f"{USER_B}_v{base + 1}", f"{USER_B}_v{base + 2}"]

    # Both versions are listed, newest first, and the scene points at the newest.
    versions = get(f"/api/scenes/{SCENE_DISCOVERY}/versions")
    user_versions = [v for v in versions if v["createdBy"] == USER_B]
    assert [v["displayVersion"] for v in user_versions[:2]] == [
        f"{USER_B}_v{base + 2}",
        f"{USER_B}_v{base + 1}",
    ]

    scene = get(f"/api/scenes/{SCENE_DISCOVERY}")
    assert scene["currentVersion"]["displayVersion"] == f"{USER_B}_v{base + 2}"

    # user A generates one version on Scene 1.
    status, gen = post(
        f"/api/scenes/{SCENE_OPENING}/generate",
        {"username": USER_A, "prompt": "The boat on the horizon"},
    )
    assert status == 200, gen
    assert gen["displayVersion"] == f"{USER_A}_v1"

    # Clean up sessions and stop the heartbeat thread.
    stop.set()
    thread.join(timeout=5)
    post("/api/sessions/leave", {"sessionId": resp_a["sessionId"]})
    post("/api/sessions/leave", {"sessionId": resp_b["sessionId"]})
