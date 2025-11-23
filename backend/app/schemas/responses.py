"""Pydantic schemas for API request and response models."""

from typing import Optional, Any
from pydantic import BaseModel, Field


# ==================== Workflow Schemas ====================

class WorkflowInfo(BaseModel):
    """Information about a MusicAI workflow."""
    
    slug: str = Field(..., description="Workflow slug identifier")
    name: str = Field(..., description="Human-readable workflow name")


class WorkflowListResponse(BaseModel):
    """Response containing list of available workflows."""
    
    workflows: list[WorkflowInfo] = Field(..., description="List of available workflows")


# ==================== Job Schemas ====================

class JobStatus(BaseModel):
    """Status information for a MusicAI job."""
    
    id: str = Field(..., description="Job unique identifier")
    status: str = Field(..., description="Job status (PENDING, PROCESSING, SUCCEEDED, FAILED)")
    name: Optional[str] = Field(None, description="Job name")
    created_at: Optional[str] = Field(None, description="Job creation timestamp")
    completed_at: Optional[str] = Field(None, description="Job completion timestamp")


class JobStatusResponse(BaseModel):
    """Response for job status queries."""
    
    job: JobStatus = Field(..., description="Job status information")


# ==================== Separation Schemas ====================

class SeparationRequest(BaseModel):
    """Request parameters for music separation."""
    
    workflow: str = Field(
        default="All stems",
        description="Workflow to use for separation (e.g., 'All stems', 'Vocals', 'Drums')"
    )
    job_name: Optional[str] = Field(
        default=None,
        description="Optional custom name for the job"
    )
    merge_note_gap: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Gap threshold for merging repeated notes (seconds)"
    )


class SeparationResponse(BaseModel):
    """Response after initiating a separation job."""
    
    job_id: str = Field(..., description="Created job identifier")
    status: str = Field(..., description="Initial job status")
    message: str = Field(..., description="Human-readable message")


# ==================== Error Schemas ====================

class ErrorDetail(BaseModel):
    """Detailed error information."""
    
    code: Optional[str] = Field(None, description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[Any] = Field(None, description="Additional error details")


class ErrorResponse(BaseModel):
    """Standardized error response."""
    
    error: ErrorDetail = Field(..., description="Error information")


# ==================== Health Check Schemas ====================

class HealthCheckResponse(BaseModel):
    """Health check response."""
    
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="API version")
    musicai_configured: bool = Field(..., description="Whether MusicAI API key is configured")
