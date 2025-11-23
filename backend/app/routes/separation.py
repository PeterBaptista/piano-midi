"""Separation and processing routes."""

import asyncio
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.schemas.responses import (
    SeparationResponse,
    JobStatusResponse,
    JobStatus,
    ErrorResponse,
)
from app.services.musicai_service import MusicAiService
from app.services.midi_service import MidiService
from app.utils.file_utils import (
    temporary_directory,
    create_zip_archive,
    save_uploaded_file,
    validate_file_exists,
    get_file_size_mb,
)
from app.utils.logger import logger
from app.config import settings

router = APIRouter(prefix="/separate", tags=["separation"])


@router.post(
    "",
    response_model=SeparationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        400: {"model": ErrorResponse, "description": "Bad request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Upload and separate music file",
    description="Upload an audio file and create a MusicAI job for stem separation",
)
async def separate_music(
    file: Annotated[UploadFile, File(description="Audio file to separate (m4a, mp3, wav, etc.)")],
    workflow: Annotated[str, Form()] = "All stems",
    job_name: Annotated[str | None, Form()] = None,
    merge_note_gap: Annotated[float | None, Form(ge=0.0, le=1.0)] = None,
):
    """
    Upload an audio file and create a separation job.
    
    The file will be uploaded to MusicAI, processed using the specified workflow,
    and a job ID will be returned for tracking.
    
    Args:
        file: Audio file to process
        workflow: MusicAI workflow to use (default: "All stems")
        job_name: Optional custom name for the job
        merge_note_gap: Optional gap threshold for merging repeated notes (seconds)
    
    Returns:
        Job information including job_id for tracking
    """
    logger.info(f"POST /separate - Received file: {file.filename}, workflow: {workflow}")
    
    try:
        # Read file content
        file_content = await file.read()
        file_size_mb = len(file_content) / (1024 * 1024)
        
        logger.info(f"File uploaded: {file.filename} ({file_size_mb:.2f} MB)")
        
        # Save file temporarily
        with temporary_directory() as temp_dir:
            file_path = save_uploaded_file(
                file_content,
                file.filename or "audio_file",
                temp_dir
            )
            
            # Upload to MusicAI
            musicai_service = MusicAiService()
            song_url = musicai_service.upload_file(str(file_path))
            
            # Create job
            job_name = job_name or f"separation-{file.filename}"
            job = musicai_service.create_job(workflow, job_name, song_url)
            
            job_id = job.get("id")
            job_status = job.get("status", "PENDING")
            
            logger.info(f"Job created successfully: {job_id}")
            
            return SeparationResponse(
                job_id=job_id,
                status=job_status,
                message=f"Separation job created. Use /separate/{job_id} to download results when ready."
            )
            
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "MusicAI service not properly configured"}}
        )
    except Exception as e:
        logger.error(f"Failed to create separation job: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "Failed to create separation job", "details": str(e)}}
        )


@router.get(
    "/{job_id}",
    responses={
        200: {"description": "ZIP file with stems and MIDI files"},
        400: {"model": ErrorResponse, "description": "Job not completed or failed"},
        404: {"model": ErrorResponse, "description": "Job not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Download separation results",
    description="Download stems and generated MIDI files for a completed job as a ZIP archive",
)
async def download_separation_results(
    job_id: str,
    merge_note_gap: float | None = None,
):
    """
    Download the results of a completed separation job.
    
    This endpoint will:
    1. Check if the job is completed
    2. Download all stem files
    3. Generate MIDI files from each stem
    4. Create a ZIP archive with all files
    5. Return the ZIP for download
    
    Args:
        job_id: ID of the separation job
        merge_note_gap: Optional gap threshold for merging repeated notes (seconds)
    
    Returns:
        ZIP file containing stems and MIDI files
    """
    logger.info(f"GET /separate/{job_id} - Downloading results")
    
    try:
        # Get job information
        musicai_service = MusicAiService()
        job_result = musicai_service.get_job(job_id)
        
        job_status = job_result.get("status")
        logger.info(f"Job {job_id} status: {job_status}")
        
        # Check if job is completed
        if job_status != "SUCCEEDED":
            if job_status in ["PENDING", "PROCESSING"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "message": f"Job is still {job_status}. Please wait for completion.",
                            "code": "JOB_NOT_READY"
                        }
                    }
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "message": f"Job failed with status: {job_status}",
                            "code": "JOB_FAILED"
                        }
                    }
                )
        
        # Download and process results
        with temporary_directory() as temp_dir:
            logger.info("Downloading job results...")
            local_files = musicai_service.download_job_results(job_result, str(temp_dir))
            
            # Generate MIDI files
            logger.info("Generating MIDI files...")
            midi_service = MidiService(merge_note_gap=merge_note_gap)

            midi_count = 0
            generated_midis: list[Path] = []
            for stem_path_str in local_files.values():
                stem_path = Path(stem_path_str)
                if validate_file_exists(stem_path):
                    midi_path = midi_service.generate_midi_from_audio(stem_path, temp_dir)
                    if midi_path:
                        midi_count += 1
                        generated_midis.append(midi_path)
            
            logger.info(f"Generated {midi_count} MIDI files")

            if generated_midis:
                unified_filename = f"unified_{job_id}.mid"
                unified_path = temp_dir / unified_filename
                unified_midi = midi_service.combine_midis(generated_midis, unified_path)
                if unified_midi:
                    logger.info(f"Unified MIDI ready: {unified_filename}")
                else:
                    logger.warning("Unified MIDI could not be generated")
            
            # Create ZIP archive
            memory_zip = create_zip_archive(temp_dir)
            
            logger.info(f"Successfully created ZIP archive for job {job_id}")
            
            return StreamingResponse(
                memory_zip,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f"attachment; filename=stems_and_midi_{job_id}.zip"
                }
            )
            
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "MusicAI service not properly configured"}}
        )
    except Exception as e:
        logger.error(f"Failed to download job results: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "Failed to process job results", "details": str(e)}}
        )


@router.get(
    "/{job_id}/status",
    response_model=JobStatusResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Job not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Check job status",
    description="Check the status of a separation job without downloading results",
)
async def check_job_status(job_id: str):
    """
    Check the status of a separation job.
    
    Use this endpoint to poll for job completion before downloading results.
    
    Args:
        job_id: ID of the separation job
    
    Returns:
        Job status information
    """
    logger.info(f"GET /separate/{job_id}/status - Checking job status")
    
    try:
        musicai_service = MusicAiService()
        job = musicai_service.get_job(job_id)
        
        job_status = JobStatus(
            id=job.get("id", job_id),
            status=job.get("status", "UNKNOWN"),
            name=job.get("name"),
            created_at=job.get("createdAt"),
            completed_at=job.get("completedAt"),
        )
        
        logger.info(f"Job {job_id} status: {job_status.status}")
        
        return JobStatusResponse(job=job_status)
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "MusicAI service not properly configured"}}
        )
    except Exception as e:
        logger.error(f"Failed to check job status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "Failed to retrieve job status", "details": str(e)}}
        )


@router.websocket(
    "/{job_id}/updates",
)
async def job_status_updates(job_id: str, websocket: WebSocket):
    """Stream MusicAI job status updates over WebSocket."""

    await websocket.accept()
    logger.info(f"WebSocket connected for job {job_id}")

    musicai_service = MusicAiService()
    last_status: str | None = None
    final_statuses = {"SUCCEEDED", "FAILED", "CANCELED", "ERROR"}

    try:
        while True:
            job = await asyncio.to_thread(musicai_service.get_job, job_id)
            status_value = job.get("status")
            payload = {
                "job_id": job_id,
                "status": status_value,
                "name": job.get("name"),
                "created_at": job.get("createdAt"),
                "completed_at": job.get("completedAt"),
                "details": job,
            }

            if status_value != last_status:
                await websocket.send_json({"event": "job_status", "payload": payload})
                last_status = status_value

            if status_value in final_statuses:
                await websocket.send_json(
                    {"event": "job_completed", "payload": {"job_id": job_id, "status": status_value}}
                )
                break

            await asyncio.sleep(settings.websocket_poll_interval_seconds)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for job {job_id}")
    except Exception as exc:
        logger.error(f"WebSocket error for job {job_id}: {exc}", exc_info=True)
        await websocket.close(code=status.HTTP_1011_INTERNAL_SERVER_ERROR)
