"""MusicAI integration service."""

from typing import Any, Optional

from musicai_sdk import MusicAiClient

from app.config import settings
from app.utils.logger import logger


class MusicAiService:
    """Service for interacting with MusicAI API."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize MusicAI service.
        
        Args:
            api_key: MusicAI API key (uses settings if not provided)
        """
        self.api_key = api_key or settings.musicai_api_key
        
        if not self.api_key:
            logger.warning("MusicAI API key not configured!")
            raise ValueError("MusicAI API key is required")
        
        self.client = MusicAiClient(api_key=self.api_key)
        logger.info("MusicAI service initialized successfully")
    
    def list_workflows(self) -> list[dict[str, Any]]:
        """
        List all available MusicAI workflows.
        
        Returns:
            List of workflow dictionaries with 'slug' and 'name' keys
        """
        logger.info("Fetching available workflows from MusicAI")
        
        try:
            workflows = self.client.list_workflows()
            
            # Handle both dict with 'data' key and direct list
            if isinstance(workflows, dict) and "data" in workflows:
                workflows = workflows["data"]
            
            logger.info(f"Retrieved {len(workflows)} workflows")
            logger.debug(f"Workflows: {[w.get('slug') for w in workflows]}")
            
            return workflows
            
        except Exception as e:
            logger.error(f"Failed to list workflows: {e}", exc_info=True)
            raise
    
    def upload_file(self, file_path: str) -> str:
        """
        Upload a file to MusicAI.
        
        Args:
            file_path: Path to the file to upload
        
        Returns:
            URL of the uploaded file
        """
        logger.info(f"Uploading file to MusicAI: {file_path}")
        
        try:
            song_url = self.client.upload_file(file_path)
            logger.info(f"File uploaded successfully: {song_url}")
            return song_url
            
        except Exception as e:
            logger.error(f"Failed to upload file {file_path}: {e}", exc_info=True)
            raise
    
    def create_job(
        self,
        workflow_slug: str,
        job_name: str,
        input_url: str,
    ) -> dict[str, Any]:
        """
        Create a new MusicAI job.
        
        Args:
            workflow_slug: Workflow to use (e.g., 'All stems')
            job_name: Name for the job
            input_url: URL of the input file
        
        Returns:
            Job information dictionary
        """
        logger.info(f"Creating MusicAI job: workflow={workflow_slug}, name={job_name}")
        
        try:
            job = self.client.add_job(
                workflow_slug,
                job_name,
                {"inputUrl": input_url}
            )
            
            job_id = job.get("id")
            logger.info(f"Job created successfully: {job_id}")
            logger.debug(f"Job details: {job}")
            
            return job
            
        except Exception as e:
            logger.error(
                f"Failed to create job (workflow={workflow_slug}, name={job_name}): {e}",
                exc_info=True
            )
            raise
    
    def wait_for_job_completion(self, job_id: str) -> dict[str, Any]:
        """
        Wait for a MusicAI job to complete.
        
        Args:
            job_id: ID of the job to wait for
        
        Returns:
            Completed job information
        """
        logger.info(f"Waiting for job completion: {job_id}")
        
        try:
            job_result = self.client.wait_for_job_completion(job_id)
            
            status = job_result.get("status")
            logger.info(f"Job {job_id} completed with status: {status}")
            
            if status != "SUCCEEDED":
                logger.warning(f"Job {job_id} did not succeed: {job_result}")
            
            return job_result
            
        except Exception as e:
            logger.error(f"Error waiting for job {job_id}: {e}", exc_info=True)
            raise
    
    def get_job(self, job_id: str) -> dict[str, Any]:
        """
        Get information about a specific job.
        
        Args:
            job_id: ID of the job
        
        Returns:
            Job information dictionary
        """
        logger.info(f"Fetching job information: {job_id}")
        
        try:
            job = self.client.get_job(job_id)
            
            status = job.get("status")
            logger.debug(f"Job {job_id} status: {status}")
            
            return job
            
        except Exception as e:
            logger.error(f"Failed to fetch job {job_id}: {e}", exc_info=True)
            raise
    
    def download_job_results(
        self,
        job_result: dict[str, Any],
        output_dir: str,
    ) -> dict[str, str]:
        """
        Download all result files from a completed job.
        
        Args:
            job_result: Job result dictionary
            output_dir: Directory to save downloaded files
        
        Returns:
            Dictionary mapping result names to local file paths
        """
        logger.info(f"Downloading job results to: {output_dir}")
        
        try:
            local_files = self.client.download_job_results(job_result, output_dir)
            
            logger.info(f"Downloaded {len(local_files)} files")
            logger.debug(f"Downloaded files: {list(local_files.keys())}")
            
            return local_files
            
        except Exception as e:
            logger.error(f"Failed to download job results: {e}", exc_info=True)
            raise
