from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.config import settings
from groq import Groq

router = APIRouter()

SYSTEM_PROMPT = """You are VitalWatch Health Assistant — a helpful, empathetic AI health advisor integrated into a patient monitoring platform.

Your role:
- Answer questions about symptoms, general health, and when to seek medical care
- Explain what the patient's vitals mean in plain language
- Provide general health guidance and precautions
- Help patients understand their alerts and what they mean

Important rules:
- Never diagnose specific medical conditions
- Always recommend consulting their doctor for serious concerns
- Be empathetic, clear, and concise
- Keep responses under 200 words
- If vitals context is provided, reference it specifically
- Always end serious symptom questions with "Please contact your doctor or call emergency services if symptoms worsen"

You are NOT a replacement for medical care. You are a supportive assistant."""


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

    client = Groq(api_key=settings.GROQ_API_KEY)

    # Build context from current vitals if available
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

    try:
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=300,
            temperature=0.4,
        )
        return {"response": response.choices[0].message.content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Chatbot unavailable — please try again")