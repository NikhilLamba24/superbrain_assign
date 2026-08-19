from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "scene-images"

    together_api_key: str = ""
    together_api_url: str = "https://api.together.ai/v1"
    together_image_model: str = "black-forest-labs/FLUX.1-schnell"
    together_timeout_seconds: float = 90.0
    # Dev/test mode: generates a local placeholder instead of calling Together AI.
    together_mock: bool = False

    session_ttl_seconds: int = 120
    cors_origins: str = "http://localhost:3000"


settings = Settings()
