"""
PCM audio utilities: jitter buffer, packet loss concealment, resampling.
"""
import numpy as np


SAMPLE_RATE = 48000
FRAME_MS = 20
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000  # 960 samples @ 48kHz


def pcm_to_float(pcm: np.ndarray) -> np.ndarray:
    return pcm.astype(np.float32) / 32768.0


def float_to_pcm(audio: np.ndarray) -> np.ndarray:
    return (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)


def apply_packet_loss(pcm: np.ndarray, loss_rate: float = 0.03) -> np.ndarray:
    """Zero out random 20ms frames to simulate network loss."""
    out = pcm.copy()
    frame_len = int(16000 * 0.02)  # ASR rate
    for i in range(0, len(out), frame_len):
        if np.random.random() < loss_rate:
            out[i : i + frame_len] = 0
    return out


def packet_loss_concealment(pcm: np.ndarray) -> np.ndarray:
    """Simple PLC: interpolate zeroed frames from neighbors."""
    frame_len = int(16000 * 0.02)
    out = pcm.copy()
    for i in range(frame_len, len(out) - frame_len, frame_len):
        seg = out[i : i + frame_len]
        if np.all(seg == 0):
            prev = out[i - frame_len : i].astype(np.float32)
            nxt = out[i + frame_len : i + 2 * frame_len].astype(np.float32)
            if len(nxt) == frame_len:
                out[i : i + frame_len] = ((prev + nxt) / 2).astype(np.int16)
            else:
                out[i : i + frame_len] = (prev * 0.7).astype(np.int16)
    return out


def compute_rms(pcm: np.ndarray) -> float:
    if pcm.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(pcm.astype(np.float64) ** 2)))


def compute_snr_mos_proxy(pcm: np.ndarray) -> float:
    """SNR-based MOS proxy (1.0-5.0). Not NISQA but correlated."""
    if pcm.size < 320:
        return 1.0
    signal_power = np.mean(pcm.astype(np.float64) ** 2) + 1e-9
    noise_est = np.var(np.diff(pcm.astype(np.float64))) + 1e-9
    snr_db = 10 * np.log10(signal_power / noise_est)
    mos = float(np.clip(1.0 + (snr_db + 10) / 12.0, 1.0, 5.0))
    return mos