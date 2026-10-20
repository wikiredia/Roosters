"""Pauze-verzoeken: "Reda wil pauze met jou, kan jij?" (vervangt de oude Afspraken).

Eigenaar: de pauze-verzoeken-feature. Zie schema.sql (break_requests, break_request_members).
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api")
