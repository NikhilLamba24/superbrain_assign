import uuid

from ..core.errors import NotFoundError, SessionConflictError, SessionExpiredError
from ..db.supabase_client import get_supabase
from . import session_service, storage_service, version_service
from .image_generation_service import ImageGenerationService


def _attach_current_versions(scenes: list[dict]) -> list[dict]:
    client = get_supabase()
    version_ids = [s["current_version_id"] for s in scenes if s.get("current_version_id")]
    versions: dict[str, dict] = {}
    if version_ids:
        res = client.table("image_versions").select("*").in_("id", version_ids).execute()
        versions = {v["id"]: v for v in res.data}
    for scene in scenes:
        vid = scene.get("current_version_id")
        version = versions.get(vid) if vid else None
        if version:
            version["display_version"] = version_service.display_version(
                version["created_by"], version["version_number"]
            )
        scene["current_version"] = version
    return scenes


def list_scenes(project_id: str) -> list[dict]:
    res = (
        get_supabase()
        .table("scenes")
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    return _attach_current_versions(res.data)


def get_scene(scene_id: str) -> dict | None:
    res = get_supabase().table("scenes").select("*").eq("id", scene_id).execute()
    if not res.data:
        return None
    return _attach_current_versions([res.data[0]])[0]


def generate_image(scene_id: str, username: str, prompt: str) -> dict:
    """Full generation pipeline: session check -> Together AI -> storage -> version."""
    scene = get_scene(scene_id)
    if scene is None:
        raise NotFoundError("Scene not found.")

    session = session_service.find_active_session(username)
    if session is None:
        raise SessionExpiredError()
    if session.get("scene_id") != scene_id:
        raise SessionConflictError(
            "Your active session is on another scene. Please select this scene first."
        )

    image_bytes, content_type = ImageGenerationService().generate(prompt)
    version_id = str(uuid.uuid4())
    image_url = storage_service.upload_scene_image(scene_id, version_id, image_bytes, content_type)
    return version_service.create_version(
        scene_id, username, image_url, prompt, version_id=version_id
    )
