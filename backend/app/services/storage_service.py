from ..core.config import settings
from ..db.supabase_client import get_supabase


def upload_scene_image(scene_id: str, version_id: str, data: bytes, content_type: str) -> str:
    """Upload generated image bytes to Supabase Storage; return a public URL."""
    client = get_supabase()
    ext = "png" if "png" in content_type else "svg" if "svg" in content_type else "bin"
    path = f"{scene_id}/{version_id}.{ext}"
    client.storage.from_(settings.supabase_storage_bucket).upload(
        path, data, {"content-type": content_type}
    )
    return f"{settings.supabase_url}/storage/v1/object/public/{settings.supabase_storage_bucket}/{path}"
