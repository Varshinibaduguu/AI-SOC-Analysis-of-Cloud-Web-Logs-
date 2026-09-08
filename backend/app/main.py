import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api import auth, chat, cloud, dashboard, documents, logs, reports
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.session import init_db

settings = get_settings()
setup_logging(settings.debug)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    await init_db()
    logger.info("AI SOC ANALYSIS SYSTEM backend started")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title=settings.app_name,
    description="Enterprise AI-powered Security Operations Center Analysis System",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = settings.api_prefix
app.include_router(auth.router, prefix=api_prefix)
app.include_router(chat.router, prefix=api_prefix)
app.include_router(documents.router, prefix=api_prefix)
app.include_router(logs.router, prefix=api_prefix)
app.include_router(reports.router, prefix=api_prefix)
app.include_router(cloud.router, prefix=api_prefix)
app.include_router(dashboard.router, prefix=api_prefix)


@app.get("/health")
@limiter.limit("30/minute")
async def health(request: Request):
    return {"status": "healthy", "service": settings.app_name}


@app.get("/")
async def root():
    return {
        "message": "AI SOC ANALYSIS SYSTEM API",
        "docs": "/docs",
        "version": "1.0.0",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    headers: dict[str, str] = {}
    origin = request.headers.get("origin", "")
    if origin and (
        origin in settings.cors_origin_list or origin.endswith(".vercel.app")
    ):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )
