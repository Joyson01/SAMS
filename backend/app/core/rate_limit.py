"""Per-client limits for costly HTTP requests in the single-worker deployment."""
from collections import OrderedDict
from dataclasses import dataclass
from math import ceil
from time import monotonic

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


@dataclass(frozen=True)
class Limit:
    capacity: int
    refill_per_second: float


LOGIN = Limit(10, 10 / 60)
LIVE = Limit(20, 8)
PHOTO = Limit(10, 10 / 60)
VIDEO = Limit(3, 3 / 60)

ROUTE_LIMITS = {
    "/auth/login": ("login", LOGIN),
    "/recognition/process": ("live", LIVE),
    "/recognition/analyze-frame": ("live", LIVE),
    "/recognition/detect": ("live", LIVE),
    "/recognition/debug/detect": ("live", LIVE),
    "/detection/photo": ("photo", PHOTO),
    "/attendance/recognize-frame": ("photo", PHOTO),
    "/attendance/recognize-image": ("photo", PHOTO),
    "/media-attendance/analyze-image": ("photo", PHOTO),
    "/media-attendance/image": ("photo", PHOTO),
    "/media-attendance/image-attendance": ("photo", PHOTO),
    "/media-attendance/image/preview": ("photo", PHOTO),
    "/media-attendance/video": ("video", VIDEO),
    "/media-attendance/video-attendance": ("video", VIDEO),
}


class RequestRateLimit:
    def __init__(self, app: ASGIApp, *, api_prefix: str):
        self.app = app
        self.prefixes = sorted({api_prefix, "/api"}, key=len, reverse=True)
        self.buckets: OrderedDict[tuple[str, str], tuple[float, float]] = OrderedDict()

    def retry_after(self, key: tuple[str, str], limit: Limit, now: float) -> int:
        tokens, updated = self.buckets.pop(key, (limit.capacity, now))
        tokens = min(limit.capacity, tokens + (now - updated) * limit.refill_per_second)
        allowed = tokens >= 1
        self.buckets[key] = (tokens - 1 if allowed else tokens, now)
        if len(self.buckets) > 16_384:
            self.buckets.popitem(last=False)
        return 0 if allowed else ceil((1 - tokens) / limit.refill_per_second)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] == "POST":
            path = scope["path"].rstrip("/")
            for prefix in self.prefixes:
                if path.startswith(prefix + "/"):
                    rule = ROUTE_LIMITS.get(path[len(prefix):])
                    if rule:
                        group, limit = rule
                        client = scope.get("client")
                        host = client[0] if client else "unknown"
                        wait = self.retry_after((host, group), limit, monotonic())
                        if wait:
                            response = JSONResponse(
                                {"detail": "Too many requests. Try again shortly."},
                                status_code=429,
                                headers={"Retry-After": str(wait), "Cache-Control": "no-store"},
                            )
                            await response(scope, receive, send)
                            return
                        break
        await self.app(scope, receive, send)
