import pytest
from backend.app.services import recognition_service as rec

@pytest.mark.asyncio
async def test_health_reports_unavailable_models(client, monkeypatch):
    monkeypatch.setattr(rec, '_pipeline_instance', None)
    response = await client.get('/api/v1/health')
    assert response.status_code == 200
    assert response.json()['ai']['status'] == 'unavailable'
    assert response.json()['ai']['message'] == 'AI engine unavailable'
