from .common import CamelModel
from .scene import SceneSummary
from .session import Collaborator


class ProjectSummary(CamelModel):
    id: str
    name: str
    scene_count: int
    active_collaborators: int


class ProjectDetail(CamelModel):
    id: str
    name: str
    scenes: list[SceneSummary] = []
    active_collaborators: list[Collaborator] = []


class ProjectPresence(CamelModel):
    """Lightweight per-second presence payload (no scenes)."""

    active_collaborators: list[Collaborator] = []
