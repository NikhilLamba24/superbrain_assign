from fastapi import APIRouter

from ..schemas.project import ProjectDetail, ProjectPresence, ProjectSummary
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
