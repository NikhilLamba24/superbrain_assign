from pydantic import Field

from .common import CamelModel


class JoinRequest(CamelModel):
    username: str = Field(min_length=1, max_length=50)
    project_id: str
    scene_id: str | None = None


class HeartbeatRequest(CamelModel):
    session_id: str
    scene_id: str | None = None


class LeaveRequest(CamelModel):
    session_id: str


class CheckRequest(CamelModel):
    username: str = Field(min_length=1, max_length=50)


class CheckResponse(CamelModel):
    available: bool


class Collaborator(CamelModel):
    username: str
    scene_id: str | None = None
    scene_name: str | None = None


class JoinResponse(CamelModel):
    success: bool = True
    session_id: str
    collaborators: list[Collaborator] = []


class HeartbeatResponse(CamelModel):
    success: bool = True


class LeaveResponse(CamelModel):
    success: bool = True