from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import base64


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "rediss://default:gQAAAAAAAaeQAAIgcDEzMzVjNGJlMWExNTk0NjZjYTAyZDg4ZTNmZmIxODkzZg@good-wildcat-108432.upstash.io:6379"

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_VITALS_TOPIC: str = "vitals-stream"
    KAFKA_ALERTS_TOPIC: str = "health-alerts"
    USE_KAFKA: bool = True

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption
    ENCRYPTION_KEY: str

    # Groq
    GROQ_API_KEY: str
    MAILJET_API_KEY: str = ""
    MAILJET_SECRET_KEY: str = ""
    MAILJET_FROM_EMAIL: str = ""
    MAILJET_FROM_NAME: str = "VitalWatch"

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        try:
            key_bytes = base64.b64decode(v)
            if len(key_bytes) != 32:
                raise ValueError("Encryption key must be exactly 32 bytes")
        except Exception:
            raise ValueError("Encryption key must be valid base64-encoded 32 bytes")
        return v

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT secret must be at least 32 characters")
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore" 


settings = Settings()