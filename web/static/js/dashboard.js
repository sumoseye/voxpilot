/**
 * Real-time dashboard — Pistachio & Warm Cream Theme
 */

let dashboardWs = null;
let latencyChart = null;
let breakdownChart = null;
let latencyData = [];
let breakdownData = { asr: [], llm: [], tts: [] };
const MAX_POINTS = 60;

function initDashboard() {
  fetchRooms();
  setupLatencyChart();
  setupBreakdownChart();
  connectDashboardWs();
  setInterval(fetchRooms, 10000);
  startDemoMetrics();
}

function connectDashboardWs() {
  if (dashboardWs && dashboardWs.readyState === WebSocket.OPEN) return;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  dashboardWs = new WebSocket(`${proto}//${window.location.host}/ws/dashboard`);

  dashboardWs.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      handleDashboardEvent(data);
    } catch (e) { /* ignore */ }
  };

  dashboardWs.onclose = () => {
    setTimeout(connectDashboardWs, 3000);
  };
}

function handleDashboardEvent(data) {
  const el = (id) => document.getElementById(id);
  if (data.active_calls !== undefined) el("d-active").textContent = data.active_calls;
  if (data.total_calls !== undefined) el("d-total").textContent = data.total_calls;
  if (data.barge_ins !== undefined) el("d-bargeins").textContent = data.barge_ins;
  if (data.tool_calls !== undefined) el("d-tools").textContent = data.tool_calls;

  if (data.e2e_ms) addLatencyPoint(data.e2e_ms);
  if (data.asr_ms || data.llm_ms || data.tts_ms) {
    addBreakdownPoint(data.asr_ms || 0, data.llm_ms || 0, data.tts_ms || 0);
  }
}

function setupLatencyChart() {
  const ctx = document.getElementById("chart-latency");
  if (!ctx) return;

  latencyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "E2E Latency (ms)",
        data: [],
        borderColor: "#121212",
        backgroundColor: "rgba(167, 213, 175, 0.4)", // Pistachio fill
        borderWidth: 3,
        fill: true,
        tension: 0.2,
        pointRadius: 0,
      }],
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          display: true,
          ticks: { color: "#121212", maxTicksLimit: 8, font: { family: "monospace", weight: "bold", size: 9 } },
          grid: { color: "rgba(18, 18, 18, 0.08)" },
        },
        y: {
          display: true,
          ticks: { color: "#121212", font: { family: "monospace", weight: "bold", size: 9 } },
          grid: { color: "rgba(18, 18, 18, 0.08)" },
          suggestedMin: 0,
          suggestedMax: 800,
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function setupBreakdownChart() {
  const ctx = document.getElementById("chart-breakdown");
  if (!ctx) return;

  breakdownChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "ASR", data: [], backgroundColor: "#A7D5AF", borderColor: "#121212", borderWidth: 2 },
        { label: "LLM", data: [], backgroundColor: "#B5D0E0", borderColor: "#121212", borderWidth: 2 },
        { label: "TTS", data: [], backgroundColor: "#F6E3A2", borderColor: "#121212", borderWidth: 2 },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: "#121212", maxTicksLimit: 8, font: { family: "monospace", weight: "bold", size: 9 } },
          grid: { color: "rgba(18, 18, 18, 0.08)" },
        },
        y: {
          stacked: true,
          ticks: { color: "#121212", font: { family: "monospace", weight: "bold", size: 9 } },
          grid: { color: "rgba(18, 18, 18, 0.08)" },
        },
      },
      plugins: {
        legend: {
          labels: { color: "#121212", font: { family: "monospace", weight: "bold", size: 10 } },
        },
      },
    },
  });
}

function addLatencyPoint(val) {
  latencyData.push(val);
  if (latencyData.length > MAX_POINTS) latencyData.shift();

  if (latencyChart) {
    latencyChart.data.labels = latencyData.map(() => "");
    latencyChart.data.datasets[0].data = [...latencyData];
    latencyChart.update();
  }

  const sorted = [...latencyData].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const el = document.getElementById("d-p95");
  if (el) el.textContent = Math.round(p95);
}

function addBreakdownPoint(asr, llm, tts) {
  breakdownData.asr.push(asr);
  breakdownData.llm.push(llm);
  breakdownData.tts.push(tts);

  if (breakdownData.asr.length > MAX_POINTS) {
    breakdownData.asr.shift();
    breakdownData.llm.shift();
    breakdownData.tts.shift();
  }

  if (breakdownChart) {
    breakdownChart.data.labels = breakdownData.asr.map(() => "");
    breakdownChart.data.datasets[0].data = [...breakdownData.asr];
    breakdownChart.data.datasets[1].data = [...breakdownData.llm];
    breakdownChart.data.datasets[2].data = [...breakdownData.tts];
    breakdownChart.update();
  }
}

async function fetchRooms() {
  try {
    const resp = await fetch("/api/rooms");
    const { rooms } = await resp.json();
    const container = document.getElementById("rooms-list");
    if (!rooms || rooms.length === 0) {
      container.innerHTML = `<p class="text-nb-muted text-xs font-semibold">No active channels routed</p>`;
      return;
    }

    container.innerHTML = rooms
      .map(
        (r) => `
      <div class="flex items-center justify-between p-3 border-3 border-nb-border bg-nb-surface shadow-[2px_2px_0px_0px_#121212]">
        <div class="flex items-center gap-3">
          <span class="pulse-dot"></span>
          <span class="font-bold text-xs text-nb-black">${r.name}</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-[10px] font-bold text-nb-muted">${r.num_participants} PARTICIPANTS</span>
          <span class="badge badge--live">${r.sid.slice(0, 8)}</span>
        </div>
      </div>
    `
      )
      .join("");
  } catch (e) {
    console.warn("Room fetch failed:", e);
  }
}

function startDemoMetrics() {
  setInterval(() => {
    const e2e = 180 + Math.random() * 220;
    const asr = 60 + Math.random() * 80;
    const llm = 50 + Math.random() * 120;
    const tts = 30 + Math.random() * 60;

    addLatencyPoint(e2e);
    addBreakdownPoint(asr, llm, tts);

    const el = (id) => document.getElementById(id);
    if (el("d-active")) el("d-active").textContent = Math.floor(Math.random() * 4);
    if (el("d-total")) el("d-total").textContent = parseInt(el("d-total").textContent || "0") + (Math.random() > 0.85 ? 1 : 0);
  }, 1500);
}