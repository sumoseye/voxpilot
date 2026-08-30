"""
Prometheus + custom voice metrics exported at /metrics.
"""
from prometheus_client import Counter, Histogram, Gauge, Info


# Counters
CALLS_TOTAL = Counter("vox_calls_total", "Total calls handled")
BARGE_INS = Counter("vox_barge_ins_total", "Times user interrupted agent")
TOOL_CALLS = Counter("vox_tool_calls_total", "Tool invocations", ["tool"])
ASR_FINALS = Counter("vox_asr_finals_total", "Final ASR transcripts")
TTS_CANCELS = Counter("vox_tts_cancels_total", "TTS barge-in cancellations")

# Histograms
ASR_LATENCY = Histogram(
    "vox_asr_latency_ms", "ASR partial-to-final latency",
    buckets=[50, 100, 150, 200, 300, 500, 1000],
)
TTS_TTFF = Histogram(
    "vox_tts_ttff_ms", "Time to first TTS frame",
    buckets=[50, 100, 150, 200, 300, 500],
)
TOOL_LATENCY = Histogram(
    "vox_tool_latency_ms", "Tool execution time",
    ["tool"],
    buckets=[50, 100, 200, 300, 500, 1000, 2000],
)
E2E_LATENCY = Histogram(
    "vox_e2e_latency_ms", "End-to-end turn latency",
    buckets=[200, 400, 600, 800, 1000, 1500, 2000],
)

# Gauges
ACTIVE_CALLS = Gauge("vox_active_calls", "Currently active calls")
VAD_STATE = Gauge("vox_vad_speech", "Current VAD speech state", ["room"])

# Info
AGENT_INFO = Info("vox_agent", "Agent version info")
AGENT_INFO.info({"version": "1.0.0", "pipeline": "groq+deepgram+cartesia"})