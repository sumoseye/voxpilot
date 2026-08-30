"""
LiveKit Agents Voice Pipeline — Headless Worker.
Adaptive across all LiveKit Agents 0.x - 1.x releases.
"""
import asyncio
import importlib
import inspect
import os
import time
import uuid
from typing import Any

import structlog
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.plugins import cartesia, deepgram, openai, silero

from server.config import settings
from server.tools import VoxTools
from server.tracing import VoiceTrace
from server.utils.metrics import (
    ACTIVE_CALLS,
    ASR_FINALS,
    ASR_LATENCY,
    BARGE_INS,
    CALLS_TOTAL,
    E2E_LATENCY,
    TTS_CANCELS,
    TTS_TTFF,
    VAD_STATE,
)

load_dotenv()
log = structlog.get_logger("agent")

# Set plugin keys
os.environ["DEEPGRAM_API_KEY"] = settings.deepgram_api_key
os.environ["CARTESIA_API_KEY"] = settings.cartesia_api_key


def _get_voice_agent_class() -> Any:
    """Dynamically resolve the Voice Agent class across versions."""
    candidates = [
        ("livekit.agents.pipeline", "VoicePipelineAgent"),
        ("livekit.agents.voice", "VoicePipelineAgent"),
        ("livekit.agents.voice", "Agent"),
        ("livekit.agents.voice_assistant", "VoiceAssistant"),
        ("livekit.agents.voice_assistant", "VoicePipelineAgent"),
        ("livekit.agents", "VoicePipelineAgent"),
        ("livekit.agents", "VoiceAssistant"),
    ]
    for mod_path, cls_name in candidates:
        try:
            mod = importlib.import_module(mod_path)
            if hasattr(mod, cls_name):
                return getattr(mod, cls_name)
        except (ImportError, ModuleNotFoundError, AttributeError):
            continue
    raise ImportError(
        "Could not find VoicePipelineAgent or VoiceAssistant in your livekit-agents package."
    )


def _build_chat_context(system_prompt: str) -> llm.ChatContext:
    """Build a ChatContext compatible with both list and method-based APIs."""
    ctx = llm.ChatContext()
    if hasattr(ctx, "append"):
        try:
            ctx.append(role="system", text=system_prompt)
            return ctx
        except Exception:
            pass

    if hasattr(llm.ChatMessage, "create"):
        try:
            msg = getattr(llm.ChatMessage, "create")(role="system", text=system_prompt)
            ctx.messages.append(msg)
            return ctx
        except Exception:
            pass

    try:
        msg = llm.ChatMessage(role="system", content=[system_prompt])  # type: ignore
        ctx.messages.append(msg)
        return ctx
    except Exception:
        pass

    try:
        msg = llm.ChatMessage(role="system", content=system_prompt)  # type: ignore
        ctx.messages.append(msg)
        return ctx
    except Exception:
        pass

    return ctx


class TurnState:
    """Per-turn timing for trace spans."""
    __slots__ = (
        "turn_id", "t_speech_start", "t_final_transcript",
        "t_llm_first", "t_tts_first", "trace", "asr_span", "llm_span", "tts_span",
    )

    def __init__(self, room_id: str):
        self.turn_id = uuid.uuid4().hex[:10]
        self.t_speech_start = time.monotonic()
        self.t_final_transcript = 0.0
        self.t_llm_first = 0.0
        self.t_tts_first = 0.0
        self.trace = VoiceTrace(room_id=room_id)
        self.asr_span = self.trace.start_span("asr_streaming")
        self.llm_span = ""
        self.tts_span = ""


async def entrypoint(ctx: JobContext):
    """Main agent entry — called by LiveKit for each room/job."""
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    room_id = ctx.room.name
    log.info("agent_connected", room=room_id, sid=ctx.room.sid)

    CALLS_TOTAL.inc()
    ACTIVE_CALLS.inc()

    turn: TurnState | None = None

    # VAD: Silero v5, 500ms silence
    silero_vad = silero.VAD.load(
        min_silence_duration=0.5,
        min_speech_duration=0.1,
        activation_threshold=0.5,
    )

    # ASR: Deepgram Nova-3
    dg_stt = deepgram.STT(
        model="nova-3",
        language="en",
        interim_results=True,
        smart_format=True,
    )

    # LLM: Native OpenAI plugin configured for Groq
    groq_llm = openai.LLM(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
        model=settings.groq_model,
        temperature=0.4,
    )

    # TTS: Cartesia Sonic-2
    cartesia_tts = cartesia.TTS(
        model="sonic-2",
        sample_rate=24000,
    )

    vox_tools = VoxTools()

    system_prompt = """You are VoxPilot, a fast, helpful voice assistant.
Rules:
- Keep responses concise (1-3 sentences for simple queries).
- If the user asks about weather, use the weather tool.
- If the user asks about their schedule or calendar, use the calendar tool.
- Speak naturally with conversational tone."""

    initial_ctx = _build_chat_context(system_prompt)

    # Dynamically instantiate the agent based on supported signature parameters
    VoiceAgentClass = _get_voice_agent_class()
    init_kwargs = {
        "vad": silero_vad,
        "stt": dg_stt,
        "llm": groq_llm,
        "tts": cartesia_tts,
        "chat_ctx": initial_ctx,
        "allow_interruptions": True,
    }

    sig = inspect.signature(VoiceAgentClass.__init__)
    if "fnc_ctx" in sig.parameters:
        init_kwargs["fnc_ctx"] = vox_tools
    elif "tools" in sig.parameters:
        init_kwargs["tools"] = vox_tools

    if "interrupt_speech_duration" in sig.parameters:
        init_kwargs["interrupt_speech_duration"] = 0.08
    if "interrupt_min_words" in sig.parameters:
        init_kwargs["interrupt_min_words"] = 0
    if "min_endpointing_delay" in sig.parameters:
        init_kwargs["min_endpointing_delay"] = 0.5

    agent = VoiceAgentClass(**init_kwargs)

    async def speak_filler(text: str):
        try:
            await agent.say(text, allow_interruptions=True)
        except Exception:
            pass

    vox_tools.set_filler_callback(speak_filler)

    @agent.on("user_started_speaking")
    def on_user_start():
        nonlocal turn
        turn = TurnState(room_id)
        VAD_STATE.labels(room=room_id).set(1)
        log.info("vad_speech_start", turn=turn.turn_id)

    @agent.on("user_stopped_speaking")
    def on_user_stop():
        VAD_STATE.labels(room=room_id).set(0)
        if turn:
            log.info("vad_speech_stop", turn=turn.turn_id)

    @agent.on("user_speech_committed")
    def on_speech_committed(msg):
        nonlocal turn
        if turn:
            turn.t_final_transcript = time.monotonic()
            asr_ms = (turn.t_final_transcript - turn.t_speech_start) * 1000
            turn.trace.end_span(turn.asr_span, text=msg.content, latency_ms=asr_ms)
            turn.trace.event("asr_final", text=msg.content, latency_ms=round(asr_ms, 1))
            ASR_LATENCY.observe(asr_ms)
            ASR_FINALS.inc()
            turn.llm_span = turn.trace.start_span("llm_generation", model=settings.groq_model)
            log.info("asr_final", turn=turn.turn_id, text=msg.content, ms=round(asr_ms, 1))

    @agent.on("agent_started_speaking")
    def on_agent_speak():
        nonlocal turn
        if turn:
            now = time.monotonic()
            if turn.t_final_transcript > 0:
                ttff = (now - turn.t_final_transcript) * 1000
                TTS_TTFF.observe(ttff)
                if turn.llm_span:
                    turn.trace.end_span(turn.llm_span, ttff_ms=ttff)
                turn.tts_span = turn.trace.start_span("tts_synthesis", ttff_ms=ttff)
                log.info("tts_first_frame", turn=turn.turn_id, ttff_ms=round(ttff, 1), under_200ms=ttff < 200)

            e2e = (now - turn.t_speech_start) * 1000
            E2E_LATENCY.observe(e2e)

    @agent.on("agent_stopped_speaking")
    def on_agent_stop():
        nonlocal turn
        if turn and turn.tts_span:
            turn.trace.end_span(turn.tts_span)
            turn.trace.finalize()

    @agent.on("agent_speech_interrupted")
    def on_interrupted(_msg):
        nonlocal turn
        BARGE_INS.inc()
        TTS_CANCELS.inc()
        if turn:
            cancel_span = turn.trace.start_span("tts_canceled", reason="barge_in")
            turn.trace.end_span(cancel_span, reason="user_speech_detected")
            turn.trace.finalize()
        log.info("barge_in", turn=turn.turn_id if turn else "none")

    agent.start(ctx.room)
    log.info("pipeline_started", room=room_id, model=settings.groq_model)
    await agent.say("Hey there! I'm VoxPilot. How can I help you today?", allow_interruptions=True)

    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        pass
    finally:
        ACTIVE_CALLS.dec()
        log.info("agent_disconnected", room=room_id)


def run_agent():
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )


if __name__ == "__main__":
    run_agent()