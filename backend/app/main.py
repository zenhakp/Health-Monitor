from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from prometheus_client import make_asgi_app, Counter, Histogram
import time
from app.core.config import settings
from app.db.database import create_tables
import asyncio
import sys
import asyncio
from app.kafka.consumer import start_consumer
from app.api import auth, patients, vitals, alerts, reports, chatbot, admin, messages, profile, emergency

# Fix for asyncpg on Windows Python 3.10+
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Prometheus metrics
REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("http_request_duration_seconds", "HTTP request latency", ["endpoint"])

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Health Monitor API",
    version="1.0.0",
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(chatbot.router, prefix="/api/v1/chatbot", tags=["chatbot"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(messages.router, prefix="/api/v1/messages", tags=["messages"])
app.include_router(profile.router, prefix="/api/v1/profile", tags=["profile"])
app.include_router(emergency.router, prefix="/api/v1/emergency", tags=["emergency"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    REQUEST_COUNT.labels(request.method, request.url.path, response.status_code).inc()
    REQUEST_LATENCY.labels(request.url.path).observe(duration)
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response


@app.on_event("startup")
async def startup():
    await create_tables()
    from app.db.database import seed_admin
    await seed_admin()
    asyncio.create_task(start_consumer())
    print("Kafka consumer task scheduled")


# Mount Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


# Import and register routers (will be added in Part 2)
# from app.api import auth, patients, vitals, alerts
# app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
# app.include_router(patients.router, prefix="/api/v1/patients", tags=["patients"])
# app.include_router(vitals.router, prefix="/api/v1/vitals", tags=["vitals"])
# app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"])
# Replace the commented block at the bottom with this:
from app.api import auth, patients, vitals, alerts
from app.kafka.producer import stop_producer

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(patients.router, prefix="/api/v1/patients", tags=["patients"])
app.include_router(vitals.router, prefix="/api/v1/vitals", tags=["vitals"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"])


@app.on_event("shutdown")
async def shutdown():
    await stop_producer()
    print("Kafka producer stopped")