from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.config import settings
import logging
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are VitalWatch Health Assistant — a helpful, empathetic AI health advisor.

Your role:
- Answer questions about symptoms, general health, and when to seek medical care
- Explain what vital signs mean in plain language
- Provide general health guidance and precautions
- Keep responses under 150 words
- Be warm, clear, and concise
- Never diagnose — always recommend consulting their doctor for serious concerns
- If vitals context is provided, reference it specifically

Always end serious symptom questions with a reminder to contact their doctor."""


class ChatMessage(BaseModel):
    message: str
    vitals_context: dict = {}


@router.post("/chat")
async def chat(
    body: ChatMessage,
    current_user: dict = Depends(get_current_user)
):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY == "your-groq-api-key-here":
        raise HTTPException(
            status_code=503,
            detail="Groq API key not configured. Get a free key at console.groq.com"
        )

    vitals_text = ""
    if body.vitals_context:
        v = body.vitals_context
        vitals_text = f"""
Current patient vitals:
- Heart Rate: {v.get('heart_rate', 'N/A')} bpm
- SpO₂: {v.get('spo2', 'N/A')}%
- Blood Pressure: {v.get('blood_pressure_sys', 'N/A')}/{v.get('blood_pressure_dia', 'N/A')} mmHg
- Temperature: {v.get('temperature', 'N/A')}°C
- Respiratory Rate: {v.get('respiratory_rate', 'N/A')}/min
"""

    user_message = f"{vitals_text}\nPatient question: {body.message}" if vitals_text else body.message

    # Use httpx directly to avoid any groq SDK version issues
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                    "max_tokens": 300,
                    "temperature": 0.4,
                }
            )

        if response.status_code != 200:
            error_detail = response.json()
            logger.error(f"Groq API error {response.status_code}: {error_detail}")
            raise HTTPException(
                status_code=503,
                detail=f"Groq API returned {response.status_code}: {error_detail.get('error', {}).get('message', 'Unknown error')}"
            )

        data = response.json()
        answer = data["choices"][0]["message"]["content"].strip()
        return {"response": answer}

    except httpx.TimeoutException:
        logger.error("Groq API timeout")
        raise HTTPException(status_code=503, detail="Health assistant timed out — please try again")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chatbot unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {type(e).__name__}: {str(e)}")