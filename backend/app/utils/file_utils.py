"""File and archive utilities."""

import io
import zipfile
import tempfile
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

from app.utils.logger import logger


@contextmanager
def temporary_directory():
    """
    Context manager for creating and cleaning up temporary directories.
    
    Yields:
        Path object pointing to the temporary directory
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        logger.debug(f"Created temporary directory: {temp_path}")
        try:
            yield temp_path
        finally:
            logger.debug(f"Cleaned up temporary directory: {temp_path}")


def create_zip_archive(
    source_dir: Path,
    include_extensions: Optional[list[str]] = None,
) -> io.BytesIO:
    """
    Create an in-memory ZIP archive from files in a directory.
    
    Args:
        source_dir: Directory containing files to zip
        include_extensions: Optional list of file extensions to include (e.g., ['.mid', '.wav'])
                          If None, includes all files
    
    Returns:
        BytesIO object containing the ZIP archive
    """
    logger.info(f"Creating ZIP archive from: {source_dir}")
    
    memory_zip = io.BytesIO()
    files_added = 0
    
    with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file_path in source_dir.iterdir():
            if not file_path.is_file():
                continue
            
            # Filter by extension if specified
            if include_extensions and file_path.suffix not in include_extensions:
                logger.debug(f"Skipping file (extension filter): {file_path.name}")
                continue
            
            # Add file to archive
            zipf.write(file_path, arcname=file_path.name)
            files_added += 1
            logger.debug(f"Added to ZIP: {file_path.name}")
    
    memory_zip.seek(0)
    
    logger.info(f"ZIP archive created with {files_added} files")
    
    return memory_zip


def validate_file_exists(file_path: Path) -> bool:
    """
    Validate that a file exists and is readable.
    
    Args:
        file_path: Path to the file to validate
    
    Returns:
        True if file exists and is readable, False otherwise
    """
    if not file_path.exists():
        logger.warning(f"File does not exist: {file_path}")
        return False
    
    if not file_path.is_file():
        logger.warning(f"Path is not a file: {file_path}")
        return False
    
    try:
        with open(file_path, 'rb') as f:
            f.read(1)
        return True
    except Exception as e:
        logger.error(f"File is not readable: {file_path} - {e}")
        return False


def get_file_size_mb(file_path: Path) -> float:
    """
    Get the size of a file in megabytes.
    
    Args:
        file_path: Path to the file
    
    Returns:
        File size in MB
    """
    size_bytes = file_path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)
    return round(size_mb, 2)


def save_uploaded_file(
    file_content: bytes,
    filename: str,
    destination_dir: Path,
) -> Path:
    """
    Save uploaded file content to a destination directory.
    
    Args:
        file_content: Binary content of the file
        filename: Name for the saved file
        destination_dir: Directory where file will be saved
    
    Returns:
        Path to the saved file
    """
    destination_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = destination_dir / filename
    
    logger.info(f"Saving uploaded file: {filename} ({len(file_content)} bytes)")
    
    with open(file_path, 'wb') as f:
        f.write(file_content)
    
    logger.debug(f"File saved to: {file_path}")
    
    return file_path
