import uuid
from datetime import datetime, timezone

from ..db.supabase_client import get_supabase


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def display_version(username: str, version_number: int) -> str:
    return f"{username}_v{version_number}"


def next_version_number(scene_id: str, created_by: str) -> int:
    res = (
        get_supabase()
        .table("image_versions")
        .select("version_number")
        .eq("scene_id", scene_id)
        .eq("created_by", created_by)
        .execute()
    )
    numbers = [r["version_number"] for r in res.data]
    return (max(numbers) + 1) if numbers else 1


def create_version(
    scene_id: str,
    created_by: str,
    image_url: str,
    prompt: str,
    version_id: str | None = None,
) -> dict:
    """Insert an immutable version and point the scene at it."""
    client = get_supabase()
    number = next_version_number(scene_id, created_by)
    vid = version_id or str(uuid.uuid4())
    now = _iso(_now())

    client.table("image_versions").insert(
        {
            "id": vid,
            "scene_id": scene_id,
            "created_by": created_by,
            "version_number": number,
            "image_url": image_url,
            "prompt": prompt,
            "created_at": now,
        }
    ).execute()
    client.table("scenes").update(
        {"current_version_id": vid, "updated_at": now}
    ).eq("id", scene_id).execute()

    return {
        "id": vid,
        "scene_id": scene_id,
        "created_by": created_by,
        "version_number": number,
        "display_version": display_version(created_by, number),
        "image_url": image_url,
        "prompt": prompt,
        "created_at": now,
    }


def list_versions(scene_id: str) -> list[dict]:
    res = (
        get_supabase()
        .table("image_versions")
        .select("*")
        .eq("scene_id", scene_id)
        .order("created_at", desc=True)
        .execute()
    )
    for row in res.data:
        row["display_version"] = display_version(row["created_by"], row["version_number"])
    return res.data
