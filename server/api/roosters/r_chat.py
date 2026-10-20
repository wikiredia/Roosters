"""Chat: groepschat van je vriendengroep (vastgepind), je woonplaats, en losse gesprekken.

Eigenaar: de chat-feature. Zie schema.sql (chats, chat_messages, chat_reads) en events.py.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api")
