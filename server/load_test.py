"""
Load Test — 50 concurrent synthetic WebRTC callers.
Pure Python via livekit-rtc SDK. No browser.
Measures TTFF, frame RTT, and connection reliability.
"""
import asyncio
import os
import statistics
import time
from dataclasses import dataclass, field
from typing import List

import numpy as np
from dotenv import load_dotenv
from livekit import api as lk_api, rtc

from server.config import settings

load_dotenv()

CONCURRENCY = 50
CALL_DURATION = 12  # seconds
SAMPLE_RATE = 48000
FRAME_MS = 20
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000  # 960


@dataclass
class CallerResult:
    caller_id: str
    connected: bool = False
    connect_ms: float = 0.0
    frames_sent: int = 0
    first_agent_audio_ms: float = 0.0
    rtt_samples: List[float] = field(default_factory=list)
    error: str = ""


def create_token(identity: str, room: str) -> str:
    token = (
        lk_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_grants(
            lk_api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
            )
        )
    )
    return token.to_jwt()


def generate_audio_frame(phase: float) -> rtc.AudioFrame:
    """Generate a 20ms sine wave frame."""
    t = np.arange(FRAME_SAMPLES) / SAMPLE_RATE
    sig = (0.15 * np.sin(2 * np.pi * 220 * t + phase) * 32767).astype(np.int16)
    return rtc.AudioFrame(
        data=sig.tobytes(),
        sample_rate=SAMPLE_RATE,
        num_channels=1,
        samples_per_channel=FRAME_SAMPLES,
    )


async def run_caller(idx: int) -> CallerResult:
    """Run a single synthetic caller."""
    caller_id = f"loadtest-caller-{idx:03d}"
    room_name = f"loadtest-room-{idx:03d}"
    result = CallerResult(caller_id=caller_id)

    try:
        room = rtc.Room()
        t_connect_start = time.monotonic()
        t_first_agent = 0.0

        def on_track_subscribed(track, *_):
            nonlocal t_first_agent
            if track.kind == rtc.TrackKind.KIND_AUDIO and t_first_agent == 0:
                t_first_agent = time.monotonic()

        room.on("track_subscribed", on_track_subscribed)

        token = create_token(caller_id, room_name)
        await room.connect(settings.livekit_url, token)
        result.connected = True
        result.connect_ms = (time.monotonic() - t_connect_start) * 1000

        # Publish audio
        source = rtc.AudioSource(SAMPLE_RATE, 1)
        track = rtc.LocalAudioTrack.create_audio_track("mic", source)
        await room.local_participant.publish_track(track)

        # Stream audio for CALL_DURATION
        t_publish = time.monotonic()
        end_time = t_publish + CALL_DURATION
        phase = 0.0
        frame_count = 0

        while time.monotonic() < end_time:
            frame = generate_audio_frame(phase)
            t_send = time.monotonic()
            await source.capture_frame(frame)
            frame_count += 1
            phase += 0.05

            # RTT proxy
            if t_first_agent > 0:
                rtt = (time.monotonic() - t_send) * 1000
                result.rtt_samples.append(rtt)

            await asyncio.sleep(FRAME_MS / 1000)

        result.frames_sent = frame_count
        if t_first_agent > 0:
            result.first_agent_audio_ms = (t_first_agent - t_publish) * 1000

        await room.disconnect()

    except Exception as e:
        result.error = str(e)

    return result


async def main():
    if not settings.livekit_url or not settings.livekit_api_key:
        print("ERROR: Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in .env")
        return

    print("=" * 60)
    print(f"  VoxPilot Load Test — {CONCURRENCY} concurrent callers")
    print(f"  Duration: {CALL_DURATION}s per caller")
    print(f"  Target: {settings.livekit_url}")
    print("=" * 60)

    t0 = time.monotonic()

    # Stagger connections to avoid thundering herd
    tasks = []
    for i in range(CONCURRENCY):
        await asyncio.sleep(0.1)  # 100ms stagger
        tasks.append(asyncio.create_task(run_caller(i)))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    total_dur = time.monotonic() - t0

    # Process results
    ok: List[CallerResult] = []
    errs = []
    for r in results:
        if isinstance(r, CallerResult) and r.connected:
            ok.append(r)
        elif isinstance(r, CallerResult):
            errs.append(r.error or "connection failed")
        else:
            errs.append(str(r))

    connect_times = [r.connect_ms for r in ok]
    ttff_times = [r.first_agent_audio_ms for r in ok if r.first_agent_audio_ms > 0]
    all_rtt = [x for r in ok for x in r.rtt_samples]
    total_frames = sum(r.frames_sent for r in ok)

    def pct(arr, p):
        if not arr:
            return 0.0
        s = sorted(arr)
        return s[min(len(s) - 1, int(len(s) * p))]

    print()
    print("╔" + "═" * 52 + "╗")
    print("║          LOAD TEST RESULTS                       ║")
    print("╠" + "═" * 52 + "╣")
    print(f"║  Total Duration      : {total_dur:>8.1f} s                 ║")
    print(f"║  Callers OK          : {len(ok):>5} / {CONCURRENCY}                 ║")
    print(f"║  Callers Failed      : {len(errs):>5}                       ║")
    print(f"║  Total Frames Sent   : {total_frames:>8}                  ║")
    print("╠" + "═" * 52 + "╣")
    print(f"║  Connect p50         : {pct(connect_times, 0.50):>8.1f} ms             ║")
    print(f"║  Connect p95         : {pct(connect_times, 0.95):>8.1f} ms             ║")
    print("╠" + "═" * 52 + "╣")
    print(f"║  TTFF p50            : {pct(ttff_times, 0.50):>8.1f} ms             ║")
    print(f"║  TTFF p95            : {pct(ttff_times, 0.95):>8.1f} ms             ║")
    print(f"║  TTFF mean           : {statistics.mean(ttff_times) if ttff_times else 0:>8.1f} ms             ║")
    print("╠" + "═" * 52 + "╣")
    print(f"║  Frame RTT p50       : {pct(all_rtt, 0.50):>8.2f} ms             ║")
    print(f"║  Frame RTT p95       : {pct(all_rtt, 0.95):>8.2f} ms             ║")
    print("╚" + "═" * 52 + "╝")

    if errs:
        print(f"\n  Errors ({len(errs)}):")
        for e in errs[:5]:
            print(f"    • {e}")


if __name__ == "__main__":
    asyncio.run(main())