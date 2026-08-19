import uuid
from datetime import datetime, timedelta, timezone

from ..core.config import settings
from ..core.errors import ForbiddenError, NotFoundError
from ..db.supabase_client import get_supabase
from . import scene_service, session_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def list_projects() -> list[dict]:
    client = get_supabase()
    projects = client.table("projects").select("*").order("created_at").execute().data

    scene_counts: dict[str, int] = {}
    for row in client.table("scenes").select("project_id").execute().data:
        scene_counts[row["project_id"]] = scene_counts.get(row["project_id"], 0) + 1

    cutoff = (_now() - timedelta(seconds=settings.session_ttl_seconds)).isoformat()
    active_counts: dict[str, int] = {}
    for row in client.table("active_sessions").select("project_id, last_seen_at").execute().data:
        if row.get("last_seen_at") and row["last_seen_at"] >= cutoff:
            active_counts[row["project_id"]] = active_counts.get(row["project_id"], 0) + 1

    return [
        {
            **p,
            "scene_count": scene_counts.get(p["id"], 0),
            "active_collaborators": active_counts.get(p["id"], 0),
        }
        for p in projects
    ]


def get_project(project_id: str) -> dict:
    res = get_supabase().table("projects").select("*").eq("id", project_id).execute()
    if not res.data:
        raise NotFoundError(f"Project '{project_id}' not found.")
    project = res.data[0]
    project["scenes"] = scene_service.list_scenes(project_id)
    project["active_collaborators"] = [
        c.model_dump() for c in session_service.get_active_collaborators(project_id)
    ]
    return project


def get_presence(project_id: str) -> list[dict]:
    """Active collaborators only; the frontend polls this every second."""
    res = get_supabase().table("projects").select("id").eq("id", project_id).execute()
    if not res.data:
        raise NotFoundError(f"Project '{project_id}' not found.")
    return [
        c.model_dump() for c in session_service.get_active_collaborators(project_id)
    ]


def create_project(username: str, name: str) -> dict:
    """Create a project; the creator becomes its admin. Seeds default scenes so
    the workspace is immediately usable (a project with no scenes cannot have a
    selected scene, generate images, or record contributors)."""
    client = get_supabase()
    project_id = f"project_{uuid.uuid4().hex[:10]}"
    now = _iso(_now())
    client.table("projects").insert(
        {
            "id": project_id,
            "name": name,
            "created_by": username,
            "created_at": now,
            "updated_at": now,
        }
    ).execute()
    _seed_default_scenes(client, project_id)
    return {"id": project_id, "name": name, "created_by": username}


_DEFAULT_SCENES = [
    ("Opening", "The first frame sets the tone and introduces the world."),
    ("Discovery", "A key detail or character enters the story."),
    ("Conflict", "Tension rises as opposing forces meet."),
    ("Revelation", "The truth behind the story is revealed."),
    ("Finale", "The story resolves in its closing frame."),
]


def _seed_default_scenes(client, project_id: str) -> None:
    client.table("scenes").insert(
        [
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "title": title,
                "description": description,
                "position": position,
            }
            for position, (title, description) in enumerate(_DEFAULT_SCENES, start=1)
        ]
    ).execute()


def _get_project_row(project_id: str) -> dict:
    res = get_supabase().table("projects").select("id, created_by").eq("id", project_id).execute()
    if not res.data:
        raise NotFoundError(f"Project '{project_id}' not found.")
    return res.data[0]


def _contributor_usernames(client, project_id: str, exclude: str | None = None) -> list[str]:
    res = (
        client.table("project_contributors")
        .select("username")
        .eq("project_id", project_id)
        .execute()
    )
    return [c["username"] for c in res.data if c["username"] != exclude]


def request_project_deletion(project_id: str, username: str) -> dict:
    """Admin requests deletion; consent of every other contributor is required."""
    client = get_supabase()
    project = _get_project_row(project_id)
    if project.get("created_by") != username:
        raise ForbiddenError("Only the project creator can request deletion.")

    # Close any stale pending request so a fresh one can start.
    client.table("project_delete_requests").update(
        {"status": "rejected", "updated_at": _iso(_now())}
    ).eq("project_id", project_id).eq("status", "pending").execute()

    contributors = _contributor_usernames(client, project_id, exclude=username)
    if not contributors:
        # No co-contributors: delete immediately.
        client.table("projects").delete().eq("id", project_id).execute()
        return {"status": "deleted", "contributors": []}

    request_id = str(uuid.uuid4())
    client.table("project_delete_requests").insert(
        {
            "id": request_id,
            "project_id": project_id,
            "requested_by": username,
            "status": "pending",
        }
    ).execute()
    return {"status": "pending", "request_id": request_id, "contributors": contributors}


def get_deletion_status(project_id: str) -> dict:
    """Current deletion-request state, polled by the frontend every second."""
    res = get_supabase().table("projects").select("id, created_by").eq("id", project_id).execute()
    if not res.data:
        # The project no longer exists (deleted).
        return {"status": "deleted", "requested_by": None, "request_id": None, "responses": []}

    req = (
        get_supabase().table("project_delete_requests")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not req.data:
        return {"status": "none", "requested_by": None, "request_id": None, "responses": []}

    request = req.data[0]
    responses = (
        get_supabase().table("project_delete_responses")
        .select("username, approved")
        .eq("request_id", request["id"])
        .execute()
    )
    return {
        "status": request["status"],
        "requested_by": request["requested_by"],
        "request_id": request["id"],
        "responses": responses.data,
    }


def respond_to_deletion(project_id: str, username: str, approve: bool) -> dict:
    """A co-contributor answers the deletion request.

    Once every contributor has answered: any rejection cancels the deletion;
    all approvals delete the project.
    """
    client = get_supabase()
    project = _get_project_row(project_id)
    admin = project.get("created_by")

    req = (
        client.table("project_delete_requests")
        .select("*")
        .eq("project_id", project_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not req.data:
        raise NotFoundError("No pending deletion request for this project.")
    request = req.data[0]

    client.table("project_delete_responses").upsert(
        {"request_id": request["id"], "username": username, "approved": approve},
        on_conflict="request_id,username",
    ).execute()

    contributors = _contributor_usernames(client, project_id, exclude=admin)
    responses = (
        client.table("project_delete_responses")
        .select("username, approved")
        .eq("request_id", request["id"])
        .execute()
    )
    responded = {r["username"] for r in responses.data}
    pending_users = [u for u in contributors if u not in responded]

    if pending_users:
        return {"status": "pending"}

    if all(r["approved"] for r in responses.data):
        client.table("project_delete_requests").update(
            {"status": "approved", "updated_at": _iso(_now())}
        ).eq("id", request["id"]).execute()
        client.table("projects").delete().eq("id", project_id).execute()
        return {"status": "deleted"}

    client.table("project_delete_requests").update(
        {"status": "rejected", "updated_at": _iso(_now())}
    ).eq("id", request["id"]).execute()
    return {"status": "rejected"}
