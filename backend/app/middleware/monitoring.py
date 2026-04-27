import time
import json
import logging
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Use a plain logger — NOT uvicorn's access logger (which has a specific format)
logger = logging.getLogger("app.monitoring")

class MonitoringMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        try:
            response: Response = await call_next(request)
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.info(
                "%s %s → %d (%.2fms)",
                request.method, request.url.path, response.status_code, duration_ms
            )
            response.headers["X-Response-Time-Ms"] = str(duration_ms)
            return response
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.error("%s %s → ERROR (%.2fms): %s", request.method, request.url.path, duration_ms, exc)
            raise
