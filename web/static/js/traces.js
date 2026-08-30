/**
 * Trace viewer — Pistachio, Cream, Powder Blue & Butter Spans
 */

const DEMO_TRACES = [
  {
    id: "t-a8f3c1",
    time: "14:32:07",
    room: "vox-demo",
    spans: [
      { name: "vad_detect", start: 0, dur: 45, color: "#A7D5AF" },
      { name: "asr_stream", start: 20, dur: 180, color: "#B5D0E0" },
      { name: "turn_detect", start: 180, dur: 30, color: "#F6E3A2" },
      { name: "llm_groq", start: 210, dur: 120, color: "#A7D5AF" },
      { name: "tts_cartesia", start: 280, dur: 150, color: "#B5D0E0" },
    ],
    transcript: "What's the weather in New York?",
    e2e_ms: 430,
  },
  {
    id: "t-b2e9d4",
    time: "14:32:12",
    room: "vox-demo",
    spans: [
      { name: "vad_detect", start: 0, dur: 38, color: "#A7D5AF" },
      { name: "asr_stream", start: 15, dur: 220, color: "#B5D0E0" },
      { name: "turn_detect", start: 200, dur: 25, color: "#F6E3A2" },
      { name: "tool_weather", start: 225, dur: 340, color: "#F6E3A2" },
      { name: "filler_speak", start: 525, dur: 80, color: "#B5D0E0" },
      { name: "llm_groq", start: 565, dur: 90, color: "#A7D5AF" },
      { name: "tts_cartesia", start: 600, dur: 130, color: "#B5D0E0" },
    ],
    transcript: "Check my calendar for today",
    e2e_ms: 730,
  },
  {
    id: "t-c7f1a9",
    time: "14:32:18",
    room: "vox-demo",
    spans: [
      { name: "vad_detect", start: 0, dur: 50, color: "#A7D5AF" },
      { name: "asr_stream", start: 10, dur: 150, color: "#B5D0E0" },
      { name: "llm_groq", start: 160, dur: 80, color: "#A7D5AF" },
      { name: "tts_cartesia", start: 200, dur: 100, color: "#B5D0E0" },
      { name: "tts_canceled", start: 250, dur: 10, color: "#F6E3A2" },
    ],
    transcript: "Actually never mind—",
    e2e_ms: 260,
    barged: true,
  },
];

function loadTraces() {
  const container = document.getElementById("traces-list");
  if (!container) return;

  container.innerHTML = DEMO_TRACES.map((trace) => {
    const totalWidth = Math.max(...trace.spans.map((s) => s.start + s.dur), 500);
    const scale = 100 / totalWidth;

    const spansHtml = trace.spans
      .map(
        (s) => `
      <div class="relative h-7 group" style="margin-left: ${s.start * scale}%; width: ${s.dur * scale}%;">
        <div class="trace-span w-full h-full flex items-center px-1" style="background-color: ${s.color}; border-color: #121212;">
          <span class="text-[9px] font-bold text-nb-black tracking-wider truncate">
            ${s.name}
          </span>
        </div>
        <div class="hidden group-hover:block absolute -top-8 left-0 bg-nb-surface border-2 border-nb-border px-2 py-1 text-[10px] font-bold text-nb-black z-20 whitespace-nowrap shadow-[2px_2px_0px_0px_#121212]">
          ${s.name}: ${s.dur}ms (offset ${s.start}ms)
        </div>
      </div>
    `
      )
      .join("");

    return `
    <div class="brutal-card ${trace.barged ? "brutal-card--butter" : ""}">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <span class="font-bold text-xs text-nb-black">${trace.id}</span>
          <span class="text-[10px] text-nb-muted font-bold">${trace.time}</span>
          <span class="badge badge--live">${trace.room}</span>
          ${trace.barged ? '<span class="badge badge--error">BARGE-IN</span>' : ""}
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-bold text-nb-muted">E2E:</span>
          <span class="font-bold text-xs bg-nb-pistachio px-2 py-0.5 border-2 border-nb-border">
            ${trace.e2e_ms}ms
          </span>
        </div>
      </div>
      <p class="text-xs font-bold text-nb-black mb-3">"${trace.transcript}"</p>
      <div class="space-y-1.5 bg-nb-canvas p-3 border-3 border-nb-border">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[9px] font-bold text-nb-muted uppercase">0ms</span>
          <div class="flex-1 h-[2px] bg-nb-border"></div>
          <span class="text-[9px] font-bold text-nb-muted uppercase">${totalWidth}ms</span>
        </div>
        ${spansHtml}
      </div>
    </div>
  `;
  }).join("");
}