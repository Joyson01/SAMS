from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.recognition import (
    AIRecognitionConfig,
    RecognitionResponse,
    ThresholdsConfig,
)
from backend.app.services.recognition_service import RecognitionService

router = APIRouter(prefix="/recognition", tags=["Face Recognition"])


@router.post(
    "/process",
    response_model=RecognitionResponse,
    summary="Process Image Frame for Face Recognition",
    description="Detects all faces, calculates alignment and embeddings, and performs multi-stage classification against enrolled students.",
)
async def process_recognition_image(
    file: UploadFile = File(..., description="JPEG or PNG image frame"),
    top_k: int = Query(3, ge=1, le=10, description="Number of top candidate matches to return"),
    run_quality_check: bool = Query(True, description="Whether to reject low-quality/blurry faces as UNCERTAIN"),
    session_id: Optional[str] = Query(None, description="Optional active session ID for attendance logging"),
    camera_id: Optional[str] = Query(None, description="Optional camera identifier"),
    db: AsyncSession = Depends(get_db),
) -> RecognitionResponse:
    from backend.app.services.attendance_service import AttendanceService
    from backend.app.schemas.attendance import AttendanceMarkPayload

    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file format '{file.content_type}'. Please upload a JPEG or PNG image.",
        )

    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        if camera_id:
            from backend.app.services.camera_service import CameraService
            await CameraService.record_frame_received(db, camera_id)

        rec_res = await RecognitionService.process_image_bytes(
            db=db,
            image_bytes=image_bytes,
            top_k=top_k,
            run_quality_check=run_quality_check,
            session_id=session_id,
            camera_id=camera_id,
        )

        if session_id:
            for face in rec_res.faces:
                # Require explicit VERIFIED status (meets high confidence threshold and margin)
                if face.decision == "KNOWN" and face.best_match and face.status == "VERIFIED":
                    try:
                        await AttendanceService.mark_attendance(
                            db=db,
                            session_id=session_id,
                            payload=AttendanceMarkPayload(
                                student_id=face.best_match.student_id,
                                camera_id=camera_id,
                                confidence=face.best_match.similarity,
                                liveness_score=face.liveness_score or 1.0,
                                remarks=f"Live stream ({face.best_match.confidence_pct:.1f}%)",
                            ),
                        )
                    except Exception:
                        pass

        return rec_res
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(val_err))


@router.post(
    "/stream/reset",
    summary="Reset Stream Tracking & Identity Cache",
    description="Clears tracking state and identity cache for a given session and/or camera.",
)
async def reset_stream_state(
    session_id: Optional[str] = Query(None, description="Session identifier"),
    camera_id: Optional[str] = Query(None, description="Camera identifier"),
):
    cleared = RecognitionService.reset_stream_state(session_id=session_id, camera_id=camera_id)
    return {"status": "success", "reset": cleared}


@router.post(
    "/sync-gallery",
    summary="Synchronize In-Memory Vector Gallery with Database",
    description="Reloads all active student face templates from PostgreSQL into the fast vectorized similarity search cache.",
)
async def sync_gallery(
    db: AsyncSession = Depends(get_db),
):
    count = await RecognitionService.sync_gallery_from_db(db)
    return {"status": "success", "synced_templates_count": count}


@router.get(
    "/thresholds",
    response_model=ThresholdsConfig,
    summary="Get Active Similarity Thresholds",
    description="Retrieves current thresholds for KNOWN, UNCERTAIN, and ambiguity margin classification.",
)
async def get_thresholds() -> ThresholdsConfig:
    return RecognitionService.get_thresholds()


@router.get(
    "/config",
    response_model=AIRecognitionConfig,
    summary="Get Full AI Recognition Configuration",
    description="Retrieves active thresholds for detection, recognition, temporal verification, tracking, quality, and liveness.",
)
async def get_ai_config() -> AIRecognitionConfig:
    return RecognitionService.get_config()


@router.put(
    "/config",
    response_model=AIRecognitionConfig,
    summary="Update AI Recognition Configuration",
    description="Updates live biometric thresholds and pipelines without server restart.",
)
@router.post(
    "/config",
    response_model=AIRecognitionConfig,
    summary="Update AI Recognition Configuration (POST)",
    description="Updates live biometric thresholds and pipelines without server restart.",
)
async def update_ai_config(
    config: AIRecognitionConfig,
) -> AIRecognitionConfig:
    return RecognitionService.set_config(config)


@router.post(
    "/detect",
    summary="Detect Faces and Analyze Quality in Frame",
    description="High-speed endpoint for camera frames returning bounding boxes, landmarks, blur score, brightness, and pose.",
)
async def detect_faces_in_frame(
    file: UploadFile = File(..., description="Camera video frame JPEG/PNG"),
):
    import time
    import cv2
    import numpy as np
    from backend.app.services.recognition_service import get_pipeline

    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file format '{file.content_type}'.",
        )

    t0 = time.perf_counter()
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty frame uploaded.")

    def _sync_detect():
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return None, 0, 0, []

        h, w = image.shape[:2]
        pipeline = get_pipeline()
        detected_faces = pipeline.detector.detect(image)

        face_items = []
        for face in detected_faces:
            quality = pipeline.quality_analyzer.analyze(image, face.bbox)
            pose = pipeline.pose_estimator.estimate(face.landmarks)

            face_items.append({
                "box": face.bbox.to_list()[:4],  # [x1, y1, x2, y2]
                "confidence": face.det_score,
                "landmarks": face.landmarks.tolist() if face.landmarks is not None else [],
                "sharpness": quality.sharpness,
                "brightness": quality.brightness,
                "is_valid": quality.is_valid,
                "rejection_reason": quality.rejection_reason,
                "pose": {
                    "yaw": pose.yaw,
                    "pitch": pose.pitch,
                    "roll": pose.roll,
                    "is_frontal": pose.is_frontal,
                    "pose_type": pose.pose_type,
                },
            })
        return image, w, h, face_items

    import asyncio
    _, w, h, results = await asyncio.to_thread(_sync_detect)
    if _ is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Failed to decode image frame.")

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return {
        "status": "success",
        "total_faces": len(results),
        "frame_width": w,
        "frame_height": h,
        "latency_ms": elapsed_ms,
        "faces": results,
    }


@router.post(
    "/debug/detect",
    summary="Debug Face Detection Endpoint",
    description="Development endpoint returning raw bounding boxes and confidence scores.",
)
async def debug_detect(
    file: UploadFile = File(..., description="Image frame"),
):
    import cv2
    import numpy as np
    import asyncio
    from backend.app.services.recognition_service import get_pipeline

    contents = await file.read()

    def _sync_debug():
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return None
        pipeline = get_pipeline()
        faces = pipeline.detector.detect(image)
        return [
            {
                "box": f.bbox.to_list()[:4],
                "confidence": round(f.det_score, 3),
            }
            for f in faces
        ]

    faces = await asyncio.to_thread(_sync_debug)
    if faces is None:
        raise HTTPException(status_code=400, detail="Invalid image bytes")
    return {"faces": faces}


@router.put(
    "/thresholds",
    response_model=ThresholdsConfig,
    summary="Update Similarity Thresholds",
    description="Updates live matching thresholds without restarting the server.",
)
@router.post(
    "/thresholds",
    response_model=ThresholdsConfig,
    summary="Update Similarity Thresholds (POST)",
    description="Updates live matching thresholds without restarting the server.",
)
async def update_thresholds(
    config: ThresholdsConfig,
) -> ThresholdsConfig:
    return RecognitionService.set_thresholds(config)

