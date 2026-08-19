from .common import CamelModel
from .scene import SceneSummary
from .session import Collaborator


class ProjectSummary(CamelModel):
    id: str
    name: str
    scene_count: int
    active_collaborators: int
    created_by: str | None = None


class ProjectDetail(CamelModel):
    id: str
    name: str
    scenes: list[SceneSummary] = []
    active_collaborators: list[Collaborator] = []
    created_by: str | None = None


class ProjectPresence(CamelModel):
    """Lightweight per-second presence payload (no scenes)."""

    active_collaborators: list[Collaborator] = []


class CreateProjectRequest(CamelModel):
    username: str
    name: str


class CreateProjectResponse(CamelModel):
    id: str
    name: str
    created_by: str


class DeleteRequestPayload(CamelModel):
    username: str


class DeleteRequestResponse(CamelModel):
    status: str  # pending | deleted (immediate when no other contributors)
    request_id: str | None = None
    contributors: list[str] = []


class DeleteVote(CamelModel):
    username: str
    approved: bool | None = None


class DeleteStatusResponse(CamelModel):
    status: str  # none | pending | rejected | deleted
    requested_by: str | None = None
    request_id: str | None = None
    responses: list[DeleteVote] = []


class VotePayload(CamelModel):
    username: str
    approve: bool


class VoteResponse(CamelModel):
    status: str  # pending | rejected | deleted
