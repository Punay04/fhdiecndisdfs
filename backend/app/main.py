"""FastAPI entrypoint: JSON API under ``/api`` plus the built single-page app at ``/``."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import get_settings


def mount_spa(app: FastAPI, static_dir: Path) -> None:
    """Serve the React build, falling back to index.html for client-side routes."""
    index = static_dir / "index.html"
    if not index.exists():
        return

    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
            return FileResponse(candidate)
        return FileResponse(index)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="UK Wind Forecast Monitor", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix="/api")
    mount_spa(app, settings.static_dir)
    return app


app = create_app()
