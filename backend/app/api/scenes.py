from fastapi import APIRouter

from ..core.errors import NotFoundError
from ..schemas.generation import GenerateRequest, GenerateResponse
from ..schemas.scene import SceneSummary, VersionSummary
from ..services import project_service, scene_service, version_service

router = APIRouter(prefix="/api", tags=["scenes"])


@router.get("/projects/{project_id}/scenes", response_model=list[SceneSummary])
def list_project_scenes(project_id: str) -> list[dict]:
    project_service.get_project(project_id)  # 404 when project is missing
    return scene_service.list_scenes(project_id)


@router.get("/scenes/{scene_id}", response_model=SceneSummary)
def get_scene(scene_id: str) -> dict:
    scene = scene_service.get_scene(scene_id)
    if scene is None:
        raise NotFoundError("Scene not found.")
    return scene


@router.post("/scenes/{scene_id}/generate", response_model=GenerateResponse)
def generate(scene_id: str, req: GenerateRequest) -> GenerateResponse:
    version = scene_service.generate_image(scene_id, req.username, req.prompt)
    return GenerateResponse(
        version_id=version["id"],
        display_version=version["display_version"],
        image_url=version["image_url"],
        created_by=version["created_by"],
        scene_id=version["scene_id"],
        prompt=version["prompt"],
        created_at=version["created_at"],
    )


@router.get("/scenes/{scene_id}/versions", response_model=list[VersionSummary])
def list_versions(scene_id: str) -> list[dict]:
    scene = scene_service.get_scene(scene_id)
    if scene is None:
        raise NotFoundError("Scene not found.")
    return version_service.list_versions(scene_id)
