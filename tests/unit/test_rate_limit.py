import pytest
from httpx import ASGITransport, AsyncClient
from starlette.responses import Response

from backend.app.core import rate_limit


async def accepted(scope, receive, send):
    await Response(status_code=204)(scope, receive, send)


@pytest.mark.asyncio
async def test_login_aliases_share_limit_and_refill(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(rate_limit, "monotonic", lambda: now[0])
    app = rate_limit.RequestRateLimit(accepted, api_prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for _ in range(10):
            assert (await client.post("/api/v1/auth/login")).status_code == 204

        limited = await client.post("/api/auth/login/")
        assert limited.status_code == 429
        assert limited.headers["Retry-After"] == "6"
        assert (await client.post("/api/v1/auth/refresh")).status_code == 204
        assert (await client.options("/api/v1/auth/login")).status_code == 204

        now[0] += 6
        assert (await client.post("/api/auth/login")).status_code == 204
        assert (await client.post("/api/auth/login")).status_code == 429


@pytest.mark.asyncio
async def test_live_frame_cadence_and_photo_limit_are_independent(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(rate_limit, "monotonic", lambda: now[0])
    app = rate_limit.RequestRateLimit(accepted, api_prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for _ in range(60):
            assert (await client.post("/api/v1/recognition/process")).status_code == 204
            now[0] += 0.25

        for _ in range(10):
            assert (await client.post("/api/media-attendance/image/preview")).status_code == 204
        assert (await client.post("/api/v1/detection/photo")).status_code == 429
        assert (await client.post("/api/v1/recognition/analyze-frame")).status_code == 204
        assert (await client.post("/api/v1/media-attendance/video")).status_code == 204

    other = ASGITransport(app=app, client=("192.0.2.1", 1234))
    async with AsyncClient(transport=other, base_url="http://test") as client:
        assert (await client.post("/api/v1/detection/photo")).status_code == 204


def test_forwarded_cloudflare_ip_requires_explicit_trusted_peer(monkeypatch):
    from backend.app.core.client_ip import request_client_ip, settings

    scope = {"client": ("172.17.0.1", 50120), "headers": [(b"cf-connecting-ip", b"192.0.2.12")]}
    monkeypatch.setattr(settings, "TRUSTED_CLOUDFLARE_PROXY_IPS", "")
    assert request_client_ip(scope) == "172.17.0.1"
    monkeypatch.setattr(settings, "TRUSTED_CLOUDFLARE_PROXY_IPS", "172.17.0.1")
    assert request_client_ip(scope) == "192.0.2.12"
    scope["headers"] = [(b"cf-connecting-ip", b"invalid")]
    assert request_client_ip(scope) == "172.17.0.1"
    scope["headers"] = [(b"cf-connecting-ip", b"192.0.2.12"), (b"cf-connecting-ip", b"192.0.2.13")]
    assert request_client_ip(scope) == "172.17.0.1"
