"""Workflow routes."""

from fastapi import APIRouter, HTTPException, status

from app.schemas.responses import WorkflowListResponse, WorkflowInfo, ErrorResponse
from app.services.musicai_service import MusicAiService
from app.utils.logger import logger

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get(
    "",
    response_model=WorkflowListResponse,
    responses={
        500: {"model": ErrorResponse, "description": "Internal server error"}
    },
    summary="List available workflows",
    description="Retrieve all available MusicAI workflows for stem separation",
)
async def list_workflows():
    """
    Get a list of all available MusicAI workflows.
    
    Returns a list of workflows with their slugs and names that can be used
    for music stem separation.
    """
    logger.info("GET /workflows - Listing available workflows")
    
    try:
        musicai_service = MusicAiService()
        workflows = musicai_service.list_workflows()
        
        # Format workflows
        formatted_workflows = [
            WorkflowInfo(
                slug=workflow.get("slug", ""),
                name=workflow.get("name", "")
            )
            for workflow in workflows
        ]
        
        logger.info(f"Successfully retrieved {len(formatted_workflows)} workflows")
        
        return WorkflowListResponse(workflows=formatted_workflows)
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "MusicAI service not properly configured"}}
        )
    except Exception as e:
        logger.error(f"Failed to list workflows: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"message": "Failed to retrieve workflows", "details": str(e)}}
        )
