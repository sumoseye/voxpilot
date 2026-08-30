"""
OpenTelemetry voice trace pipeline → Langfuse.
Every voice turn produces spans: ASR → VAD → LLM → TTS → delivery.
"""
import time
import uuid
from contextlib import contextmanager
from typing import Optional

import structlog
from langfuse import Langfuse

from server.config import settings

log = structlog.get_logger("tracing")

_langfuse: Optional[Langfuse] = None


def get_langfuse() -> Langfuse:
    global _langfuse
    if _langfuse is None:
        _langfuse = Langfuse(
            secret_key=settings.langfuse_secret_key,
            public_key=settings.langfuse_public_key,
            host=settings.langfuse_host,
        )
    return _langfuse


class VoiceTrace:
    """
    Models one complete voice turn as a Langfuse trace with child spans:
      trace (turn)
        ├── span: vad_speech_detected
        ├── span: asr_streaming
        │     ├── event: partial_transcript
        │     └── event: final_transcript
        ├── span: turn_detector
        ├── span: llm_generation (Groq)
        ├── span: tts_synthesis (Cartesia)
        ├── span: tool_execution (if any)
        └── span: tts_canceled (if barge-in)
    """

    def __init__(self, room_id: str, user_id: str = "caller"):
        self.lf = get_langfuse()
        self.turn_id = str(uuid.uuid4())[:12]
        self.trace = self.lf.trace(
            id=self.turn_id,
            name="voice_turn",
            metadata={"room": room_id, "user": user_id},
            tags=["voice", "realtime"],
        )
        self.t_start = time.monotonic()
        self._spans = {}

    def start_span(self, name: str, **meta) -> str:
        span_id = f"{name}-{uuid.uuid4().hex[:6]}"
        span = self.trace.span(
            name=name,
            metadata=meta,
            start_time=self._now(),
        )
        self._spans[span_id] = {"span": span, "t0": time.monotonic()}
        return span_id

    def end_span(self, span_id: str, **meta):
        if span_id in self._spans:
            entry = self._spans[span_id]
            dur_ms = (time.monotonic() - entry["t0"]) * 1000
            entry["span"].end(
                metadata={**meta, "duration_ms": round(dur_ms, 2)},
                end_time=self._now(),
            )

    def event(self, name: str, **meta):
        self.trace.event(name=name, metadata=meta)

    def score(self, name: str, value: float, comment: str = ""):
        self.trace.score(name=name, value=value, comment=comment)

    def finalize(self):
        try:
            self.lf.flush()
        except Exception as e:
            log.warning("langfuse_flush_failed", err=str(e))

    def _now(self):
        from datetime import datetime, timezone
        return datetime.now(timezone.utc)