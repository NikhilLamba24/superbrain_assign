from fastapi import APIRouter

from ..schemas.session import (
    CheckRequest,
    CheckResponse,
    HeartbeatRequest,
    HeartbeatResponse,
    JoinRequest,
    JoinResponse,
    LeaveRequest,
    LeaveResponse,
)
from ..services import session_service

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/join", response_model=JoinResponse)
def join(req: JoinRequest) -> JoinResponse:
    result = session_service.join(req.username, req.project_id, req.scene_id)
    return JoinResponse(session_id=result["session_id"], collaborators=result["collaborators"])


@router.post("/check", response_model=CheckResponse)
def check(req: CheckRequest) -> CheckResponse:
    return CheckResponse(available=session_service.is_username_available(req.username))


@router.post("/heartbeat", response_model=HeartbeatResponse)
def heartbeat(req: HeartbeatRequest) -> HeartbeatResponse:
    session_service.heartbeat(req.session_id, req.scene_id)
    return HeartbeatResponse()


@router.post("/leave", response_model=LeaveResponse)
def leave(req: LeaveRequest) -> LeaveResponse:
    session_service.leave(req.session_id)
    return LeaveResponse()
