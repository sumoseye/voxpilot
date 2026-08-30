"""
Centralized configuration via pydantic-settings. Reads .env automatically.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LiveKit
    livekit_url: str = "wss://localhost:7880"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # Groq (LLM)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Deepgram (ASR)
    deepgram_api_key: str = ""

    # Cartesia (TTS)
    cartesia_api_key: str = ""

    # Twilio (SIP / PSTN)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_sip_domain: str = ""

    # Langfuse (Telemetry / Observability)
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_host: str = "https://us.cloud.langfuse.com"

    # Server
    host: str = "0.0.0.0"
    port: int = 8890
    debug: bool = False


settings = Settings()