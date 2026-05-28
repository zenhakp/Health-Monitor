from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_, and_
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
import json
import asyncio

from app.db.database import get_db, async_session_maker
from app.db.models import Base, User
from app.core.security import get_current_user
from app.core.encryption import decrypt, encrypt

router = APIRouter()

_message_subscribers: dict[str, list[asyncio.Queue]] = {}


def _format_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    receiver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content_encrypted = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class SendMessageRequest(BaseModel):
    receiver_id: str
    content: str


@router.post("/send")
async def send_message(
    body: SendMessageRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    sender_id = current_user.get("sub")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body.content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long — max 2000 characters")

    # Verify receiver exists
    result = await db.execute(select(User).where(User.id == uuid.UUID(body.receiver_id)))
    receiver = result.scalar_one_or_none()
    if not receiver:
        raise HTTPException(status_code=404, detail="Recipient not found")

    msg = Message(
        id=uuid.uuid4(),
        sender_id=uuid.UUID(sender_id),
        receiver_id=uuid.UUID(body.receiver_id),
        content_encrypted=encrypt(body.content),
        is_read=False,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    await db.commit()

    # Get sender name
    sender_result = await db.execute(select(User).where(User.id == uuid.UUID(sender_id)))
    sender = sender_result.scalar_one_or_none()
    sender_name = decrypt(sender.full_name_encrypted) if sender else "Unknown"

    msg_data = {
        "id": str(msg.id),
        "sender_id": sender_id,
        "sender_name": sender_name,
        "content": body.content,
        "is_read": False,
        "created_at": str(msg.created_at),
    }

    # Push to receiver's SSE stream
    receiver_id = body.receiver_id
    if receiver_id in _message_subscribers:
        for queue in _message_subscribers[receiver_id]:
            try:
                queue.put_nowait(msg_data)
            except asyncio.QueueFull:
                pass

    return msg_data


@router.get("/conversation/{other_user_id}")
async def get_conversation(
    other_user_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = uuid.UUID(current_user.get("sub"))
    other_id = uuid.UUID(other_user_id)

    result = await db.execute(
        select(Message).where(
            or_(
                and_(Message.sender_id == user_id, Message.receiver_id == other_id),
                and_(Message.sender_id == other_id, Message.receiver_id == user_id),
            )
        ).order_by(Message.created_at.asc()).limit(100)
    )
    messages = result.scalars().all()

    # Mark as read
    for msg in messages:
        if str(msg.receiver_id) == str(user_id) and not msg.is_read:
            msg.is_read = True
    await db.commit()

    # Get sender names
    user_ids = list(set([str(m.sender_id) for m in messages]))
    name_map = {}
    for uid in user_ids:
        ur = await db.execute(select(User).where(User.id == uuid.UUID(uid)))
        u = ur.scalar_one_or_none()
        if u:
            name_map[uid] = decrypt(u.full_name_encrypted)

    return [
        {
            "id": str(m.id),
            "sender_id": str(m.sender_id),
            "sender_name": name_map.get(str(m.sender_id), "Unknown"),
            "content": decrypt(m.content_encrypted),
            "is_read": m.is_read,
            "created_at": str(m.created_at),
        }
        for m in messages
    ]


@router.get("/contacts")
async def get_contacts(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    role = current_user.get("role")
    user_id = uuid.UUID(current_user.get("sub"))

    if role == "patient":
        result = await db.execute(
            select(User).where(User.role == "doctor", User.is_active == True)
        )
    else:
        result = await db.execute(
            select(User).where(User.role == "patient", User.is_active == True)
        )
    users = result.scalars().all()

    contacts = []
    for u in users:
        # Count unread messages from this user
        unread_result = await db.execute(
            select(Message).where(
                Message.sender_id == u.id,
                Message.receiver_id == user_id,
                Message.is_read == False,
            )
        )
        unread = len(unread_result.scalars().all())

        contacts.append({
            "id": str(u.id),
            "full_name": decrypt(u.full_name_encrypted),
            "email": u.email,
            "role": str(u.role.value if hasattr(u.role, 'value') else u.role),
            "last_seen": _format_datetime(u.last_login),
            "avatar_url": u.avatar_url or "",
            "unread_count": unread,
        })
    return contacts


@router.get("/unread-count")
async def unread_count(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = uuid.UUID(current_user.get("sub"))
    result = await db.execute(
        select(Message).where(Message.receiver_id == user_id, Message.is_read == False)
    )
    msgs = result.scalars().all()
    return {"count": len(msgs)}


@router.get("/stream")
async def message_stream(current_user: dict = Depends(get_current_user)):
    """SSE stream for incoming messages."""
    user_id = current_user.get("sub")

    async def generator():
        queue = asyncio.Queue(maxsize=50)
        if user_id not in _message_subscribers:
            _message_subscribers[user_id] = []
        _message_subscribers[user_id].append(queue)
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps({'type': 'message', **msg})}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if user_id in _message_subscribers:
                try:
                    _message_subscribers[user_id].remove(queue)
                except ValueError:
                    pass

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )