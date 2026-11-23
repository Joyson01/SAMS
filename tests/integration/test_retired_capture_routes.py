import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize("prefix", ["/api/v1", "/api"])
async def test_remote_capture_routes_are_unavailable(staff_client, prefix):
    schema = (await staff_client.get("/openapi.json", follow_redirects=True)).json()
    for path in schema["paths"]:
        assert not path.startswith((f"{prefix}/cameras", f"{prefix}/phone-attendance"))

    for path in ("/cameras/mobile-pairing", "/phone-attendance/example/pair"):
        response = await staff_client.post(prefix + path)
        assert response.status_code in (404, 405)


@pytest.mark.asyncio
async def test_media_paths_require_authorization(client, staff_client, monkeypatch, tmp_path):
    from backend.app import main

    output = tmp_path / "output.jpg"
    output.write_bytes(b"test media")
    monkeypatch.setattr(main, "_OUTPUTS_DIR", tmp_path)

    unauthenticated = await client.get("/outputs/output.jpg", headers={"Authorization": ""})
    assert unauthenticated.status_code == 401

    authorized = await staff_client.get("/outputs/output.jpg")
    assert authorized.status_code == 200
    assert authorized.content == b"test media"
    assert authorized.headers["Cache-Control"] == "private, no-store"

    for path in ("/uploads/media/output.jpg", "/processed/output.jpg"):
        assert (await staff_client.get(path)).status_code == 404
