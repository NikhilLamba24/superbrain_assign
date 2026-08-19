from datetime import datetime

from .common import CamelModel


class VersionSummary(CamelModel):
    id: str
    scene_id: str
    created_by: str
    version_number: int
    display_version: str
    image_url: str
    prompt: str
    created_at: datetime


class SceneSummary(CamelModel):
    id: str
    project_id: str
    title: str
    description: str | None = None
    position: int
    current_version: VersionSummary | None = None
