from datetime import datetime

from pydantic import Field

from .common import CamelModel


class GenerateRequest(CamelModel):
    username: str
    prompt: str = Field(min_length=1, max_length=2000)


class GenerateResponse(CamelModel):
    version_id: str
    display_version: str
    image_url: str
    created_by: str
    scene_id: str
    prompt: str
    created_at: datetime
