from ipaddress import ip_address

from starlette.datastructures import Headers
from starlette.types import Scope

from backend.app.core.config import settings


def validated_ip(value: str | None) -> str | None:
    try:
        return str(ip_address(value.strip())) if value else None
    except ValueError:
        return None


def request_client_ip(scope: Scope) -> str | None:
    """Use an edge-provided IP only when an explicitly trusted tunnel sent it."""
    client = scope.get("client")
    peer = validated_ip(client[0]) if client else None
    if not peer:
        return None
    if peer in {part.strip() for part in settings.TRUSTED_CLOUDFLARE_PROXY_IPS.split(",")}:
        headers = Headers(scope=scope).getlist("cf-connecting-ip")
        if len(headers) == 1:
            return validated_ip(headers[0]) or peer
    return peer
