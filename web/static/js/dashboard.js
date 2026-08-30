/**
 * Real-time dashboard — WebSocket metrics stream + Chart.js.
 */

let dashboardWs = null;
let latencyChart = null;
let breakdownChart = null;
let latencyData = [];
let breakdownData = { asr: [], llm: [], tts: [] };
const MAX_POINTS = 60;

function initDashboard() {
  // Fetch initial rooms
  fetchRooms();

  // Setup charts
  setupLatencyChart();
  setupBreakdownChart();

  // Connect WebSocket
  connectDashboardWs();

  // Poll rooms every 10s
  setInterval(fetchRooms, 10000);

  // Simulated metrics for demo (replace with real WS data)
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

  if (data.e2e_ms) {
    addLatencyPoint(data.e2e_ms);
  }

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
        borderColor: "#00ff88",
        backgroundColor: "rgba(0,255,136,0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      }],
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          display: true,
          ticks: { color: "#666", maxTicksLimit: 10, font: { family: "monospace", size: 9 } },
          grid: { color: "#2a2a2a" },
        },
        y: {
          display: true,
          ticks: { color: "#666", font: { family: "monospace", size: 9 } },
          grid: { color: "#2a2a2a" },
          suggestedMin: 0,
          suggestedMax: 1000,
        },
      },
      plugins: {
        legend: { display: false },
      },
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
        { label: "ASR", data: [], backgroundColor: "#00ff88", borderWidth: 0 },
        { label: "LLM", data: [], backgroundColor: "#ff3366", borderWidth: 0 },
        { label: "TTS", data: [], backgroundColor: "#6633ff", borderWidth: 0 },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: "#666", maxTicksLimit: 10, font: { family: "monospace", size: 9 } },
          grid: { color: "#2a2a2a" },
        },
        y: {
          stacked: true,
          ticks: { color: "#666", font: { family: "monospace", size: 9 } },
          grid: { color: "#2a2a2a" },
        },
      },
      plugins: {
        legend: {
          labels: { color: "#e0e0e0", font: { family: "monospace", size: 10 } },
        },
      },
    },
  });
}

function addLatencyPoint(val) {
  const label = timeNow();
  latencyData.push(val);
  if (latencyData.length > MAX_POINTS) latencyData.shift();

  if (latencyChart) {
    latencyChart.data.labels = latencyData.map((_, i) => "");
    latencyChart.data.datasets[0].data = [...latencyData];
    latencyChart.update();
  }

  // Update p95
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
    breakdownChart.data.labels = breakdownData.asr.map((_, i) => "");
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
      container.innerHTML = `<p class="text-nb-muted text-sm">No active rooms</p>`;
      return;
    }

    container.innerHTML = rooms
      .map(
        (r) => `
      <div class="flex items-center justify-between p-3 border-2 border-nb-border bg-nb-surface">
        <div class="flex items-center gap-3">
          <span class="pulse-dot"></span>
          <span class="font-bold text-sm text-nb-text">${r.name}</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-xs text-nb-muted">${r.num_participants} participants</span>
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

// Demo metrics generator (remove when real data flows)
function startDemoMetrics() {
  setInterval(() => {
    const e2e = 200 + Math.random() * 400;
    const asr = 80 + Math.random() * 100;
    const llm = 60 + Math.random() * 200;
    const tts = 40 + Math.random() * 80;

    addLatencyPoint(e2e);
    addBreakdownPoint(asr, llm, tts);

    const el = (id) => document.getElementById(id);
    el("d-active").textContent = Math.floor(Math.random() * 5);
    el("d-total").textContent = parseInt(el("d-total").textContent || "0") + (Math.random() > 0.8 ? 1 : 0);
  }, 1500);
}