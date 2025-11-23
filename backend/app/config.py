"""Application configuration and settings."""

import os
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Configuration
    app_name: str = "Piano MIDI API"
    app_version: str = "0.1.0"
    debug: bool = False
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 5000
    
    # MusicAI Configuration
    musicai_api_key: str = os.getenv("MUSICAI_API_KEY", "")
    
    # MIDI Processing Configuration
    merge_note_gap_seconds: float = 0.08
    uniform_velocity: int = 80
    uniform_instrument: int = 0  # Acoustic Grand Piano
    
    # File paths
    base_dir: Path = Path(__file__).parent.parent
    temp_dir: Optional[Path] = None
    
    # Logging Configuration
    log_level: str = "INFO"
    log_file: Optional[str] = None
    log_rotation: str = "500 MB"
    log_retention: str = "10 days"
    
    # CORS Configuration
    cors_origins: list[str] = ["*"]
    # WebSocket polling
    websocket_poll_interval_seconds: float = 2.0
    
    class Config:
        """Pydantic config."""
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()
