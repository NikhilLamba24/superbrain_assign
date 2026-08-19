import uuid
from datetime import datetime, timedelta, timezone

from ..core.config import settings
from ..core.errors import NotFoundError, SessionConflictError, SessionExpiredError
from ..db.supabase_client import get_supabase
from ..schemas.session import Collaborator


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _active_cutoff() -> datetime:
    return _now() - timedelta(seconds=settings.session_ttl_seconds)


def _is_active(session: dict) -> bool:
    last_seen = session.get("last_seen_at")
    if not last_seen:
        return False
    return datetime.fromisoformat(last_seen) >= _active_cutoff()


def get_session(session_id: str) -> dict | None:
    res = get_supabase().table("active_sessions").select("*").eq("id", session_id).execute()
    return res.data[0] if res.data else None


def find_active_session(username: str) -> dict | None:
    res = (
        get_supabase()
        .table("active_sessions")
        .select("*")
        .eq("username", username)
        .execute()
    )
    for session in res.data:
        if _is_active(session):
            return session
    return None


def _ensure_user(username: str) -> None:
    get_supabase().table("users").upsert({"username": username}, on_conflict="username").execute()


def is_username_available(username: str) -> bool:
    """True when the username has no currently active session."""
    return find_active_session(username) is None


def join(username: str, project_id: str, scene_id: str | None) -> dict:
    """Create a temporary session for a username. Raises on active collision."""
    client = get_supabase()
    if find_active_session(username):
        raise SessionConflictError()

    project = client.table("projects").select("id").eq("id", project_id).execute()
    if not project.data:
        raise NotFoundError(f"Project '{project_id}' not found.")

    _ensure_user(username)

    # The username column is unique, so drop any expired sessions first to make
    # the username available again (PRD: available after its session expires).
    client.table("active_sessions").delete().eq("username", username).execute()

    now = _now()
    session_id = str(uuid.uuid4())
    client.table("active_sessions").insert(
        {
            "id": session_id,
            "username": username,
            "project_id": project_id,
            "scene_id": scene_id,
            "last_seen_at": _iso(now),
            "created_at": _iso(now),
        }
    ).execute()

    return {"session_id": session_id, "collaborators": get_active_collaborators(project_id)}


def heartbeat(session_id: str, scene_id: str | None) -> None:
    client = get_supabase()
    session = get_session(session_id)
    if session is None or not _is_active(session):
        if session is not None:
            client.table("active_sessions").delete().eq("id", session_id).execute()
        raise SessionExpiredError()

    updates: dict = {"last_seen_at": _iso(_now())}
    if scene_id is not None:
        updates["scene_id"] = scene_id
    client.table("active_sessions").update(updates).eq("id", session_id).execute()


def leave(session_id: str) -> None:
    get_supabase().table("active_sessions").delete().eq("id", session_id).execute()


def get_active_collaborators(project_id: str) -> list[Collaborator]:
    client = get_supabase()
    res = (
        client.table("active_sessions")
        .select("username, scene_id, last_seen_at")
        .eq("project_id", project_id)
        .execute()
    )
    sessions = [s for s in res.data if _is_active(s)]
    if not sessions:
        return []

    scene_ids = [s["scene_id"] for s in sessions if s.get("scene_id")]
    names: dict[str, str] = {}
    if scene_ids:
        scenes = client.table("scenes").select("id, title").in_("id", scene_ids).execute()
        names = {s["id"]: s["title"] for s in scenes.data}

    return [
        Collaborator(
            username=s["username"],
            scene_id=s.get("scene_id"),
            scene_name=names.get(s["scene_id"]) if s.get("scene_id") else None,
        )
        for s in sessions
    ]


def count_active_collaborators(project_id: str) -> int:
    res = (
        get_supabase()
        .table("active_sessions")
        .select("id", count="exact")
        .eq("project_id", project_id)
        .execute()
    )
    return res.count or 0
