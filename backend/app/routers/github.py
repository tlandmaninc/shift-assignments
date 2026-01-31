"""GitHub Integration API Router (Placeholder).

Provides endpoints for GitHub integration features.
Currently returns placeholder responses until implementation is needed.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from ..services.github_service import github_service

router = APIRouter(prefix="/github", tags=["github"])


class GitHubStatusResponse(BaseModel):
    """Response from GitHub status check."""
    configured: bool
    connected: bool
    repo: Optional[str] = None
    error: Optional[str] = None


class GitHubFeatureResponse(BaseModel):
    """Response for placeholder features."""
    implemented: bool = False
    message: str
    documentation: Optional[str] = None


@router.get("/status", response_model=GitHubStatusResponse)
async def check_github_status():
    """
    Check GitHub integration status.

    Returns whether GitHub is configured and if the connection is working.
    """
    if not github_service.is_configured:
        return GitHubStatusResponse(
            configured=False,
            connected=False,
            error="GitHub not configured. Set GITHUB_TOKEN and GITHUB_REPO environment variables.",
        )

    result = await github_service.check_connection()

    return GitHubStatusResponse(
        configured=True,
        connected=result.get("connected", False),
        repo=result.get("repo"),
        error=result.get("error"),
    )


@router.get("/features", response_model=dict)
async def list_github_features():
    """
    List available GitHub integration features.

    Returns information about planned and implemented features.
    """
    return {
        "status": "placeholder",
        "configured": github_service.is_configured,
        "features": {
            "team_sync": {
                "implemented": False,
                "description": "Sync employees from GitHub teams",
                "planned": True,
            },
            "issue_creation": {
                "implemented": False,
                "description": "Create issues for shift conflicts",
                "planned": True,
            },
            "file_sync": {
                "implemented": False,
                "description": "Read schedules from repository files",
                "planned": True,
            },
            "workflow_trigger": {
                "implemented": False,
                "description": "Trigger GitHub Actions for notifications",
                "planned": True,
            },
        },
        "setup_instructions": {
            "1": "Create a GitHub Personal Access Token at https://github.com/settings/tokens",
            "2": "Grant 'repo' scope for private repos or 'public_repo' for public repos",
            "3": "Set GITHUB_TOKEN=your-token in environment",
            "4": "Set GITHUB_REPO=owner/repo-name in environment",
        },
    }


# Placeholder endpoints for future features

@router.get("/team/{team_slug}/members", response_model=GitHubFeatureResponse)
async def get_team_members(team_slug: str):
    """
    Placeholder: Get members from a GitHub team.

    This feature will be implemented when team sync is needed.
    """
    return GitHubFeatureResponse(
        implemented=False,
        message=f"Team sync for '{team_slug}' is not yet implemented",
        documentation="https://docs.github.com/en/rest/teams/members",
    )


@router.post("/issues", response_model=GitHubFeatureResponse)
async def create_issue():
    """
    Placeholder: Create a GitHub issue.

    This feature will be implemented when issue creation is needed.
    """
    return GitHubFeatureResponse(
        implemented=False,
        message="Issue creation is not yet implemented",
        documentation="https://docs.github.com/en/rest/issues/issues",
    )


@router.post("/workflows/{workflow_id}/dispatch", response_model=GitHubFeatureResponse)
async def trigger_workflow(workflow_id: str):
    """
    Placeholder: Trigger a GitHub Actions workflow.

    This feature will be implemented when workflow automation is needed.
    """
    return GitHubFeatureResponse(
        implemented=False,
        message=f"Workflow trigger for '{workflow_id}' is not yet implemented",
        documentation="https://docs.github.com/en/rest/actions/workflows",
    )
