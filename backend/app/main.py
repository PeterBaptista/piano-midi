"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from scalar_fastapi import get_scalar_api_reference

from app.config import settings
from app.routes import workflows, separation
from app.schemas.responses import HealthCheckResponse
from app.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler for startup and shutdown events.
    """
    # Startup
    logger.info("=" * 60)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Debug mode: {settings.debug}")
    logger.info(f"MusicAI configured: {bool(settings.musicai_api_key)}")
    logger.info("=" * 60)
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
    Piano MIDI API - Convert music stems to MIDI files
    
    This API provides endpoints for:
    - Separating music into stems using MusicAI
    - Generating MIDI files from audio stems
    - Merging repeated notes for cleaner MIDI output
    
    ## Workflow
    
    1. **Upload Audio**: POST to `/separate` with your audio file
    2. **Check Status**: GET `/separate/{job_id}/status` to monitor progress
    3. **Download Results**: GET `/separate/{job_id}` to download stems + MIDI as ZIP
    
    ## Features
    
    - Automatic stem separation via MusicAI
    - MIDI transcription using Basic Pitch
    - Intelligent note merging to handle rapid repetitions
    - Normalized MIDI output (velocity, instrument)
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    debug=settings.debug,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(workflows.router)
app.include_router(separation.router)


@app.get(
    "/",
    tags=["root"],
    summary="Root endpoint",
    description="Simple redirect to API documentation",
)
async def root():
    """Redirect to API documentation."""
    return {
        "message": "Welcome to Piano MIDI API",
        "version": settings.app_version,
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get(
    "/health",
    response_model=HealthCheckResponse,
    tags=["health"],
    summary="Health check",
    description="Check if the API is running and properly configured",
)



@app.get(
    "/api",
    status_code=200,
    summary="Scalar API Reference",
    description="Get the Scalar API reference for this FastAPI application",
    tags=["System"],
    include_in_schema=False,
)
async def root():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,
        title=app.title,
    )

async def health_check():
    """
    Health check endpoint.
    
    Returns service status and configuration information.
    """
    logger.debug("Health check requested")
    
    return HealthCheckResponse(
        status="healthy",
        version=settings.app_version,
        musicai_configured=bool(settings.musicai_api_key),
    )


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting server on {settings.host}:{settings.port}")
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
