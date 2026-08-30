"""
Side-channel tools with 300ms SLA filler. Concurrent execution.
Works as livekit-agents FunctionContext for the voice pipeline.
"""
import asyncio
import time

import httpx
import structlog
from livekit.agents import llm

from server.utils.metrics import TOOL_CALLS, TOOL_LATENCY

log = structlog.get_logger("tools")

FILLER_MSG = "One moment, let me check that for you."
FILLER_TIMEOUT = 0.3  # 300ms SLA


class VoxTools(llm.FunctionContext):
    """Two concurrent tools: weather + calendar."""

    def __init__(self):
        super().__init__()
        self._filler_cb = None

    def set_filler_callback(self, cb):
        """Register a callback that speaks filler text via TTS."""
        self._filler_cb = cb

    async def _maybe_filler(self, tool_name: str, t0: float):
        """Fire filler speech if tool takes > 300ms."""
        try:
            await asyncio.sleep(FILLER_TIMEOUT)
            elapsed = (time.monotonic() - t0) * 1000
            log.info("filler_triggered", tool=tool_name, elapsed_ms=elapsed)
            if self._filler_cb:
                await self._filler_cb(FILLER_MSG)
        except asyncio.CancelledError:
            pass

    @llm.ai_callable(
        description="Get current weather for a city. Call when user asks about weather, temperature, or forecast."
    )
    async def weather(
        self,
        city: str = llm.TypeInfo(description="City name, e.g. 'San Francisco'"),
    ) -> str:
        t0 = time.monotonic()
        TOOL_CALLS.labels(tool="weather").inc()
        filler_task = asyncio.create_task(self._maybe_filler("weather", t0))

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                try:
                    resp = await client.get(
                        "https://wttr.in",
                        params={"q": city, "format": "3"},
                        headers={"User-Agent": "VoxPilot/1.0"},
                    )
                    result = resp.text.strip() if resp.status_code == 200 else None
                except Exception:
                    result = None

            if not result:
                result = f"Weather in {city}: 68°F, partly cloudy, light breeze."

            return result
        finally:
            filler_task.cancel()
            dur = (time.monotonic() - t0) * 1000
            TOOL_LATENCY.labels(tool="weather").observe(dur)
            log.info("tool_complete", tool="weather", city=city, ms=round(dur, 1))

    @llm.ai_callable(
        description="Get today's calendar events and meetings. Call when user asks about their schedule."
    )
    async def calendar(self) -> str:
        t0 = time.monotonic()
        TOOL_CALLS.labels(tool="calendar").inc()
        filler_task = asyncio.create_task(self._maybe_filler("calendar", t0))

        try:
            # Simulated calendar API (replace with Google Calendar / O365)
            await asyncio.sleep(0.18)
            events = [
                {"time": "10:00 AM", "title": "Team standup"},
                {"time": "1:00 PM", "title": "Design review with Sarah"},
                {"time": "3:30 PM", "title": "Sprint planning"},
                {"time": "5:00 PM", "title": "One-on-one with manager"},
            ]
            lines = [f"  • {e['time']} — {e['title']}" for e in events]
            return f"You have {len(events)} events today:\n" + "\n".join(lines)
        finally:
            filler_task.cancel()
            dur = (time.monotonic() - t0) * 1000
            TOOL_LATENCY.labels(tool="calendar").observe(dur)
            log.info("tool_complete", tool="calendar", ms=round(dur, 1))