from datetime import datetime, timedelta, timezone

from ..core.config import settings
from ..core.errors import NotFoundError
from ..db.supabase_client import get_supabase
from . import scene_service, session_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
