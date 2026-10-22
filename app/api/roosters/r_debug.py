"""Troubleshooting endpoints for the laptop/test server. They answer 404 unless ENV=dev."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from . import config, debug, redisx
from .errors import ApiError
from .r_auth import _client_ip

router = APIRouter(prefix="/api/v1/debug", tags=["debug"])


def dev_only():
    if not config.DEV:
        raise ApiError(404, "not_found")


class TestMailIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


@router.get("", dependencies=[Depends(dev_only)])
def diagnose():
    """Mail settings, SMTP reachable?, worker running?, the last login mails and what to do about them."""
    return debug.diagnose()


@router.post("/mail", dependencies=[Depends(dev_only)])
def test_mail(body: TestMailIn, request: Request):
    redisx.rate_limit(f"debug-mail:{_client_ip(request)}", 10, 3600)
    return debug.send_test_mail(body.email.strip())
