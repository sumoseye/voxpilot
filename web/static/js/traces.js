/**
 * Trace viewer — renders Langfuse-style voice turn traces.
 */

const DEMO_TRACES = [
    {
      id: "t-a8f3c1",
      time: "14:32:07",
      room: "vox-demo",
      spans: [
        { name: "vad_detect", start: 0, dur: 45, color: "#ffcc00" },
        { name: "asr_stream", start: 20, dur: 180, color: "#00ff88" },
        { name: "turn_detect", start: 180, dur: 30, color: "#00ccff" },
        { name: "llm_groq", start: 210, dur: 120, color: "#ff3366" },
        { name: "tts_cartesia", start: 280, dur: 150, color: "#6633ff" },
      ],
      transcript: "What's the weather in New York?",
      e2e_ms: 430,
    },
    {
      id: "t-b2e9d4",
      time: "14:32:12",
      room: "vox-demo",
      spans: [
        { name: "vad_detect", start: 0, dur: 38, color: "#ffcc00" },
        { name: "asr_stream", start: 15, dur: 220, color: "#00ff88" },
        { name: "turn_detect", start: 200, dur: 25, color: "#00ccff" },
        { name: "tool_weather", start: 225, dur: 340, color: "#ffcc00" },
        { name: "filler_speak", start: 525, dur: 80, color: "#666666" },
        { name: "llm_groq", start: 565, dur: 90, color: "#ff3366" },
        { name: "tts_cartesia", start: 600, dur: 130, color: "#6633ff" },
      ],
      transcript: "Check my calendar for today",
      e2e_ms: 730,
    },
    {
      id: "t-c7f1a9",
      time: "14:32:18",
      room: "vox-demo",
      spans: [
        { name: "vad_detect", start: 0, dur: 50, color: "#ffcc00" },
        { name: "asr_stream", start: 10, dur: 150, color: "#00ff88" },
        { name: "llm_groq", start: 160, dur: 80, color: "#ff3366" },
        { name: "tts_cartesia", start: 200, dur: 100, color: "#6633ff" },
        { name: "tts_canceled", start: 250, dur: 10, color: "#ff3366" },
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
          <div class="trace-span w-full h-full" style="background: ${s.color}20; border-color: ${s.color};">
            <span class="absolute inset-0 flex items-center px-1 text-[9px] font-bold tracking-wider truncate"
                  style="color: ${s.color};">
              ${s.name}
            </span>
          </div>
          <div class="hidden group-hover:block absolute -top-8 left-0 bg-nb-surface border-2 border-nb-border px-2 py-1 text-[10px] text-nb-text z-10 whitespace-nowrap">
            ${s.name}: ${s.dur}ms (offset ${s.start}ms)
          </div>
        </div>
      `
        )
        .join("");
  
      return `
      <div class="brutal-card ${trace.barged ? "brutal-card--red" : ""}">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-3">
            <span class="font-bold text-sm text-nb-accent">${trace.id}</span>
            <span class="text-xs text-nb-muted">${trace.time}</span>
            <span class="badge badge--live">${trace.room}</span>
            ${trace.barged ? '<span class="badge badge--error">BARGE-IN</span>' : ""}
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-nb-muted">E2E:</span>
            <span class="font-bold text-sm ${trace.e2e_ms < 500 ? "text-nb-accent" : "text-nb-accent2"}">
              ${trace.e2e_ms}ms
            </span>
          </div>
        </div>
        <p class="text-sm text-nb-text mb-3">"${trace.transcript}"</p>
        <div class="space-y-1 bg-nb-bg p-3 border-2 border-nb-border">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-[9px] text-nb-muted uppercase tracking-widest">0ms</span>
            <div class="flex-1 h-px bg-nb-border"></div>
            <span class="text-[9px] text-nb-muted uppercase tracking-widest">${totalWidth}ms</span>
          </div>
          ${spansHtml}
        </div>
      </div>
    `;
    }).join("");
  }