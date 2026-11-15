"""Staff-only photo detection, independent of student recognition."""

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from backend.app.core.security import require_roles
from backend.app.services.anonymous_detection import MAX_UPLOAD_BYTES, analyze_photo

router = APIRouter(prefix='/detection', tags=['Anonymous detection'],
                   dependencies=[Depends(require_roles('ADMIN', 'FACULTY'))])


class FaceLocation(BaseModel):
    bbox: tuple[float, float, float, float]
    detection_score: float
    small_face: bool


class AnonymousPhotoResult(BaseModel):
    mode: Literal['anonymous']
    frame_width: int
    frame_height: int
    face_count: int
    latency_ms: float
    faces: list[FaceLocation]


@router.post('/photo', response_model=AnonymousPhotoResult)
async def detect_photo(file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    return await asyncio.to_thread(analyze_photo, data)
