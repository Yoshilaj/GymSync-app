"""
HTTP-only ASGI middleware: correlation id, wall-clock timing, structured access log.

Applies to request/response routes (chat SSE, ops). WebSocket turns bypass ASGI HTTP
middleware, so voice/WS timing + metrics are recorded inline in the agent chokepoint
(see agents.core.run_agent_turn) rather than here.
"""
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.monitoring import RequestTimer, logger


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id

        with RequestTimer() as timer:
            response = await call_next(request)

        response.headers["x-request-id"] = request_id
        logger.info(
            "http_request",
            extra={
                "extra_data": {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "latency_ms": round(timer.elapsed_ms, 1),
                }
            },
        )
        return response
