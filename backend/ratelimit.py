"""
Phase 5 — In-Memory Rate Limiter
Sliding window, per-key. Zero external deps.
"""
import time
import threading
from collections import defaultdict, deque
from fastapi import HTTPException, Request

_BUCKETS = defaultdict(lambda: deque())
_LOCK = threading.Lock()


def _cleanup(key, window):
    """Remove old timestamps outside window."""
    cutoff = time.time() - window
    bucket = _BUCKETS[key]
    while bucket and bucket[0] < cutoff:
        bucket.popleft()


def check_rate(key, max_requests, window_seconds):
    """Raise 429 if limit exceeded."""
    with _LOCK:
        _cleanup(key, window_seconds)
        bucket = _BUCKETS[key]
        if len(bucket) >= max_requests:
            retry_after = int(bucket[0] + window_seconds - time.time()) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {retry_after}s.",
                headers={"Retry-After": str(retry_after)}
            )
        bucket.append(time.time())


def get_client_ip(request):
    """Extract real client IP (behind proxy safe)."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─── Presets ───
def limit_login(request):
    check_rate(f"login:{get_client_ip(request)}", 5, 300)


def limit_api(request, user):
    check_rate(f"api:{user}", 100, 60)


def limit_ai(request, user):
    check_rate(f"ai:{user}", 10, 60)


def limit_websocket(ip):
    check_rate(f"ws:{ip}", 10, 60)
