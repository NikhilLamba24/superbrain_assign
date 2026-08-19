from supabase import Client, create_client

from ..core.config import settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return a cached Supabase client using the service-role key (server-only)."""
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. "
                "Copy backend/.env.example to backend/.env and fill in the values."
            )
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client
