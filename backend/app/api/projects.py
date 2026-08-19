from fastapi import APIRouter

from ..schemas.project import (
    CreateProjectRequest,
    CreateProjectResponse,
    DeleteRequestPayload,
    DeleteRequestResponse,
    DeleteStatusResponse,
    ProjectDetail,
    ProjectPresence,
    ProjectSummary,
    VotePayload,
    VoteResponse,
)
from ..services import project_service

router = APIRouter(prefix="/api", tags=["projects"])


@router.get("/projects", response_model=list[ProjectSummary])
def list_projects() -> list[dict]:
    return project_service.list_projects()


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str) -> dict:
    return project_service.get_project(project_id)


@router.get("/projects/{project_id}/presence", response_model=ProjectPresence)
def get_project_presence(project_id: str) -> ProjectPresence:
    return ProjectPresence(active_collaborators=project_service.get_presence(project_id))


@router.post("/projects", response_model=CreateProjectResponse)
def create_project(req: CreateProjectRequest) -> dict:
    return project_service.create_project(req.username, req.name)


@router.post("/projects/{project_id}/delete/request", response_model=DeleteRequestResponse)
def request_deletion(project_id: str, req: DeleteRequestPayload) -> dict:
    return project_service.request_project_deletion(project_id, req.username)


@router.get("/projects/{project_id}/delete/status", response_model=DeleteStatusResponse)
def deletion_status(project_id: str) -> dict:
    return project_service.get_deletion_status(project_id)


@router.post("/projects/{project_id}/delete/vote", response_model=VoteResponse)
def deletion_vote(project_id: str, req: VotePayload) -> dict:
    return project_service.respond_to_deletion(project_id, req.username, req.approve)
