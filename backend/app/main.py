import sys
import time
import uuid
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure project root is in sys.path when executed directly
_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.api.v1.router import api_router
from backend.app.core.config import settings
from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger, setup_logging
from backend.app.database.session import check_database_connection, init_db_schema
from backend.app.services.face_recognition_service import face_recognition_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")

    # Initialize Face Recognition Service & Embeddings at Startup
    logger.info("Initializing InsightFace buffalo_l engine for Media & Real-time Attendance...")
    _ = face_recognition_service.app
    emb_count = len(face_recognition_service.load_embeddings(force_reload=True))
    logger.info(f"InsightFace engine ready with {emb_count} student face embedding(s).")

    # Verify DB connectivity & initialize development schema if needed
    db_connected, db_info, latency = await check_database_connection()
    if db_connected:
        logger.info(f"Connected to database ({db_info}) in {latency}ms")
        try:
            await init_db_schema()
        except Exception as e:
            logger.warning(f"Auto-schema init skipped or deferred: {e}")

        # Pre-warm FaceRecognitionPipeline and vectorize in-memory gallery at startup (eliminates first-frame lag)
        try:
            from backend.app.database.session import AsyncSessionLocal
            from backend.app.services.recognition_service import RecognitionService, get_pipeline
            _ = get_pipeline()
            async with AsyncSessionLocal() as db:
                gallery_cnt = await RecognitionService.sync_gallery_from_db(db)
            logger.info(f"FaceRecognitionPipeline pre-warmed with {gallery_cnt} gallery template(s).")
        except Exception as pipe_err:
            logger.warning(f"Pipeline pre-warm notice: {pipe_err}")
    else:
        logger.warning(f"Database connection offline at startup: {db_info}")

    yield

    # Shutdown
    logger.info("Application shutting down...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# Configure CORS Middleware (allowing LAN mobile browsers and desktop clients)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Telemetry & Logging Middleware
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    req_id = uuid.uuid4().hex[:8]
    request.state.request_id = req_id
    start_time = time.perf_counter()

    try:
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Process-Time-Ms"] = str(elapsed_ms)

        # Skip noisy high-frequency frame polling logs
        if not request.url.path.endswith("/frame") and not request.url.path.endswith("/preview"):
            logger.info(
                f"[{req_id}] {request.method} {request.url.path} -> {response.status_code} ({elapsed_ms}ms)"
            )
        return response
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(
            f"[{req_id}] Unhandled error on {request.method} {request.url.path} ({elapsed_ms}ms): {exc}\n{traceback.format_exc()}"
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected server error occurred. Please try again or check backend logs.",
                    "details": [{"request_id": req_id}],
                },
            },
            headers={"X-Request-ID": req_id, "X-Process-Time-Ms": str(elapsed_ms)},
        )


# Global Exception Handlers
@app.exception_handler(SAMSException)
async def sams_exception_handler(request: Request, exc: SAMSException):
    req_id = getattr(request.state, "request_id", uuid.uuid4().hex[:8])
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "detail": exc.message,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details if isinstance(exc.details, (list, dict)) else [str(exc.details)],
            },
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    req_id = getattr(request.state, "request_id", uuid.uuid4().hex[:8])
    formatted_errors = []
    for err in exc.errors():
        loc_str = " -> ".join(str(l) for l in err.get("loc", []) if l not in ["body", "query", "path"])
        msg = err.get("msg", "Invalid value")
        formatted_errors.append({"field": loc_str or "payload", "message": msg, "type": err.get("type")})

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "detail": "The request payload failed input validation.",
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request payload failed input validation.",
                "details": formatted_errors,
            },
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    req_id = getattr(request.state, "request_id", uuid.uuid4().hex[:8])
    if isinstance(exc.detail, dict) and "error_code" in exc.detail:
        err_code = exc.detail.get("error_code", f"HTTP_{exc.status_code}")
        msg = exc.detail.get("message", str(exc.detail))
        details = exc.detail.get("details", [])
    elif isinstance(exc.detail, dict):
        err_code = exc.detail.get("code", f"HTTP_{exc.status_code}")
        msg = exc.detail.get("message", exc.detail.get("detail", str(exc.detail)))
        details = exc.detail.get("details", [])
    else:
        err_code = f"HTTP_{exc.status_code}"
        msg = str(exc.detail)
        details = []

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "detail": msg,
            "error": {
                "code": err_code,
                "message": msg,
                "details": details if isinstance(details, list) else [details],
            },
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", uuid.uuid4().hex[:8])
    logger.error(f"[{req_id}] Unexpected 500 error on {request.method} {request.url.path}: {exc}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "detail": "An unexpected server error occurred. Please try again.",
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected server error occurred. Please try again.",
                "details": [{"request_id": req_id}],
            },
        },
        headers={"X-Request-ID": req_id},
    )


# Include API v1 Router and /api alias
app.include_router(api_router, prefix=settings.API_V1_STR)
if settings.API_V1_STR != "/api":
    app.include_router(api_router, prefix="/api")

# Mount Static Outputs and Uploads Directories
_ROOT = Path(__file__).resolve().parent.parent.parent
_OUTPUTS_DIR = _ROOT / "outputs"
_UPLOADS_DIR = _ROOT / "data" / "uploads"
_PROCESSED_DIR = _ROOT / "data" / "uploads" / "media"

_OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/outputs", StaticFiles(directory=str(_OUTPUTS_DIR)), name="outputs")
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")
app.mount("/processed", StaticFiles(directory=str(_PROCESSED_DIR)), name="processed")

# Mount Production Frontend Dist if Available
_FRONTEND_DIST = _ROOT / "frontend" / "dist"
if _FRONTEND_DIST.exists() and (_FRONTEND_DIST / "index.html").exists():
    _ASSETS_DIR = _FRONTEND_DIST / "assets"
    if _ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="frontend-assets")


@app.get("/", tags=["Root"])
async def root(request: Request):
    accept = request.headers.get("accept", "")
    if settings.ENVIRONMENT != "testing" and "text/html" in accept and _FRONTEND_DIST.exists() and (_FRONTEND_DIST / "index.html").exists():
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "docs_url": f"{settings.API_V1_STR}/docs",
        "health_url": f"{settings.API_V1_STR}/health",
    }


@app.get("/docs", include_in_schema=False)
async def redirect_docs():
    return RedirectResponse(url=f"{settings.API_V1_STR}/docs")


@app.get("/redoc", include_in_schema=False)
async def redirect_redoc():
    return RedirectResponse(url=f"{settings.API_V1_STR}/redoc")


@app.get("/openapi.json", include_in_schema=False)
async def redirect_openapi():
    return RedirectResponse(url=f"{settings.API_V1_STR}/openapi.json")


@app.get("/health", tags=["Root"])
async def root_health():
    """Top-level health check endpoint redirecting to v1 health logic."""
    db_connected, db_info, latency_ms = await check_database_connection()
    return {
        "status": "healthy" if db_connected else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": {
            "status": "connected" if db_connected else "disconnected",
            "type": db_info,
            "latency_ms": latency_ms,
        },
    }


# Production Single Page Application (SPA) Client-Side Route Fallback
if _FRONTEND_DIST.exists() and (_FRONTEND_DIST / "index.html").exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith(("api", "outputs", "uploads", "processed", "health", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404, detail="Endpoint not found")
        target_file = _FRONTEND_DIST / full_path
        if target_file.is_file():
            return FileResponse(str(target_file))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
