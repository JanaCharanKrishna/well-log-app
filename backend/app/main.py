import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.orm import Session
from app.config import settings
from app.database import engine, Base, get_db
from app.routers import wells, interpretation, chat

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup."""
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready.")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Well Log Analyzer",
    description=(
        "A web-based system for ingesting LAS well-log files, "
        "visualizing gas chromatography curves, and performing "
        "AI-assisted interpretation."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS - Allow all for communication reliability
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(wells.router)
app.include_router(interpretation.router)
app.include_router(chat.router)


@app.get("/")
def read_root():
    return {"message": "Well Log Analyzer API is running successfully!"}


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    status = {"status": "ok", "database": "unknown", "s3": "unknown"}
    
    # Test DB
    try:
        db.execute(text("SELECT 1"))
        status["database"] = "connected"
    except Exception as e:
        status["database"] = f"error: {str(e)}"
        status["status"] = "error"

    # Test S3
    try:
        from app.services.s3_service import s3_service
        # Just try to see if client exists or list (no-op)
        if s3_service.client:
            status["s3"] = "initialized"
        else:
            status["s3"] = "not_configured"
    except Exception as e:
        status["s3"] = f"error: {str(e)}"
        status["status"] = "error"

    return status


# ── Optional: serve frontend build in single-container mode ──
# If a frontend/dist directory exists next to the backend, serve it.
# In Docker this is handled by nginx, but this allows running everything
# from a single process for simpler deployments.
_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if _frontend_dist.is_dir():
    assets_dir = _frontend_dist / "assets"
    index_file = _frontend_dist / "index.html"

    # Serve static assets (js, css, images) only when build assets exist.
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    @app.get("/{path:path}")
    async def serve_spa(request: Request, path: str):
        """Serve the SPA index.html for any non-API route."""
        file_path = _frontend_dist / path
        if file_path.is_file():
            return FileResponse(file_path)
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build files not found.")
