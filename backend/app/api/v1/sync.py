from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from backend.app.core.security import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.sync import (
    SyncBatchPushRequest,
    SyncBatchPushResponse,
    SyncPullDeltaResponse,
    SyncQueueStatusResponse,
)
from backend.app.services.sync_service import SyncService

router = APIRouter(prefix="/sync", tags=["Offline Edge Synchronization"])


@router.get(
    "/status",
    response_model=SyncQueueStatusResponse,
    summary="Get Sync Queue Status",
    description="Returns counts of pending, synced, and failed edge sync events.",
)
async def get_sync_status(
    db: AsyncSession = Depends(get_db),
) -> SyncQueueStatusResponse:
    return await SyncService.get_sync_queue_status(db)


@router.post(
    "/push",
    response_model=SyncBatchPushResponse,
    summary="Push Batch Events from Edge",
    description="Ingests a batch of offline attendance and recognition events from an edge node with idempotent deduplication.",
)
async def push_sync_batch(
    batch: SyncBatchPushRequest,
    db: AsyncSession = Depends(get_db),
) -> SyncBatchPushResponse:
    return await SyncService.process_push_batch(db, batch)


@router.get(
    "/pull",
    response_model=SyncPullDeltaResponse,
    summary="Pull Incremental Delta Updates",
    description="Pulls new and updated student records, face profile embeddings, and sessions since a given timestamp.",
)
async def pull_delta_updates(
    since_timestamp: Optional[datetime] = Query(None, description="ISO timestamp to filter updates since"),
    db: AsyncSession = Depends(get_db),
) -> SyncPullDeltaResponse:
    return await SyncService.get_delta_updates(db, since_timestamp)


@router.post(
    "/trigger",
    summary="Trigger Sync Flush",
    description="Manually triggers synchronization of all pending queue items.",
)
async def trigger_sync_flush(
    db: AsyncSession = Depends(get_db),
):
    flushed_count = await SyncService.flush_pending_queue(db)
    return {"status": "success", "flushed_count": flushed_count}

