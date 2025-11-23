"""Logging configuration using Loguru."""

import sys
from pathlib import Path
from typing import Optional

from loguru import logger

from app.config import settings


def setup_logger(
    log_level: Optional[str] = None,
    log_file: Optional[str] = None,
) -> None:
    """
    Configure Loguru logger with custom settings.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional file path for logging to file
    """
    # Remove default handler
    logger.remove()
    
    # Use settings if not provided
    log_level = log_level or settings.log_level
    log_file = log_file or settings.log_file
    
    # Console handler with colors
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level=log_level,
        colorize=True,
    )
    
    # File handler if specified
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        logger.add(
            log_file,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
            level=log_level,
            rotation=settings.log_rotation,
            retention=settings.log_retention,
            compression="zip",
        )
    
    logger.info(f"Logger configured with level: {log_level}")


# Initialize logger on import
setup_logger()

# Export logger for use in other modules
__all__ = ["logger", "setup_logger"]
