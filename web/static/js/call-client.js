/**
 * LiveKit WebRTC Browser Client — headless-compatible call logic.
 * Connects to LiveKit room, publishes mic, receives agent audio.
 */

let currentRoom = null;
let audioContext = null;
let userAnalyser = null;
let agentAnalyser = null;
let vizInterval = null;

async function startCall() {
  const roomName = document.getElementById("room-input").value || "vox-demo";
  const identity = document.getElementById("identity-input").value || "caller-1";

  setCallStatus("connecting", "CONNECTING...");

  try {
    // Get token from our API
    const resp = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomName, identity: identity }),
    });
    const { token, livekit_url } = await resp.json();

    // Create room
    currentRoom = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
    });

    // Wire up events
    currentRoom.on(LivekitClient.RoomEvent.Connected, () => {
      setCallStatus("live", "CONNECTED");
      addTranscript("system", `Connected to room: ${roomName}`);
    });

    currentRoom.on(LivekitClient.RoomEvent.Disconnected, () => {
      setCallStatus("idle", "DISCONNECTED");
      addTranscript("system", "Disconnected from room");
      cleanup();
    });

    currentRoom.on(LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind === LivekitClient.Track.Kind.Audio) {
        const el = track.attach();
        el.id = "agent-audio";
        el.style.display = "none";
        document.body.appendChild(el);
        setupAgentViz(el);
        addTranscript("system", `Agent audio track received`);
      }
    });

    currentRoom.on(LivekitClient.RoomEvent.DataReceived, (payload, participant) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "transcript") {
          addTranscript(msg.role || "agent", msg.text);
        }
        if (msg.type === "metrics") {
          updateCallMetrics(msg);
        }
      } catch (e) { /* binary data, ignore */ }
    });

    currentRoom.on(LivekitClient.RoomEvent.TrackMuted, (pub, participant) => {
      if (!participant.isLocal) {
        addTranscript("system", "⚡ Agent speech interrupted (barge-in)");
      }
    });

    // Connect
    await currentRoom.connect(livekit_url, token);

    // Publish microphone
    await currentRoom.localParticipant.setMicrophoneEnabled(true);
    setupUserViz();

    document.getElementById("btn-connect").style.display = "none";
    document.getElementById("btn-disconnect").style.display = "";

  } catch (err) {
    console.error("Call failed:", err);
    setCallStatus("error", "ERROR");
    addTranscript("system", `Error: ${err.message}`);
  }
}

async function endCall() {
  if (currentRoom) {
    await currentRoom.disconnect();
    currentRoom = null;
  }
  cleanup();
  document.getElementById("btn-connect").style.display = "";
  document.getElementById("btn-disconnect").style.display = "none";
}

function cleanup() {
  if (vizInterval) clearInterval(vizInterval);
  const agentEl = document.getElementById("agent-audio");
  if (agentEl) agentEl.remove();
}

function setCallStatus(state, text) {
  const el = document.getElementById("call-status");
  el.textContent = text;
  el.className = `badge badge--${state === "live" ? "live" : state === "error" ? "error" : "idle"}`;
}

function addTranscript(role, text) {
  const log = document.getElementById("transcript-log");
  // Remove placeholder
  const placeholder = log.querySelector(".italic");
  if (placeholder) placeholder.remove();

  const colors = {
    user: "text-nb-accent",
    agent: "text-nb-accent3",
    system: "text-nb-muted",
    tool: "text-nb-yellow",
  };

  const div = document.createElement("div");
  div.className = `flex gap-3 ${role === "system" ? "opacity-60" : ""}`;
  div.innerHTML = `
    <span class="${colors[role] || "text-nb-text"} text-xs font-bold uppercase w-16 shrink-0">
      ${role}
    </span>
    <span class="text-nb-text text-sm">${text}</span>
    <span class="text-nb-muted text-xs ml-auto shrink-0">${timeNow()}</span>
  `;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function updateCallMetrics(m) {
  const el = (id) => document.getElementById(id);
  if (m.asr_ms && el("m-asr-ms")) el("m-asr-ms").textContent = fmtMs(m.asr_ms);
  if (m.llm_ms && el("m-llm-ms")) el("m-llm-ms").textContent = fmtMs(m.llm_ms);
  if (m.tts_ms && el("m-tts-ms")) el("m-tts-ms").textContent = fmtMs(m.tts_ms);
  if (m.e2e_ms && el("m-e2e-ms")) el("m-e2e-ms").textContent = fmtMs(m.e2e_ms);
}

// ===== Audio Visualizers =====

function setupUserViz() {
  const container = document.getElementById("user-viz");
  container.innerHTML = "";
  const bars = 32;
  for (let i = 0; i < bars; i++) {
    const bar = document.createElement("div");
    bar.className = "viz-bar flex-1";
    bar.style.height = "2px";
    container.appendChild(bar);
  }

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const source = audioContext.createMediaStreamSource(stream);
      userAnalyser = audioContext.createAnalyser();
      userAnalyser.fftSize = 64;
      source.connect(userAnalyser);
      startViz();
    });
  } catch (e) {
    console.warn("Audio viz not available:", e);
  }
}

function setupAgentViz(audioEl) {
  const container = document.getElementById("agent-viz");
  container.innerHTML = "";
  const bars = 32;
  for (let i = 0; i < bars; i++) {
    const bar = document.createElement("div");
    bar.className = "viz-bar flex-1";
    bar.style.height = "2px";
    bar.style.backgroundColor = "#6633ff";
    container.appendChild(bar);
  }

  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaElementSource(audioEl);
    agentAnalyser = audioContext.createAnalyser();
    agentAnalyser.fftSize = 64;
    source.connect(agentAnalyser);
    agentAnalyser.connect(audioContext.destination);
  } catch (e) {
    console.warn("Agent viz error:", e);
  }
}

function startViz() {
  if (vizInterval) clearInterval(vizInterval);
  vizInterval = setInterval(() => {
    renderViz("user-viz", userAnalyser, "#00ff88");
    renderViz("agent-viz", agentAnalyser, "#6633ff");
  }, 50);
}

function renderViz(containerId, analyser, color) {
  if (!analyser) return;
  const container = document.getElementById(containerId);
  const bars = container.children;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  for (let i = 0; i < bars.length; i++) {
    const idx = Math.floor((i / bars.length) * data.length);
    const val = data[idx] || 0;
    const height = Math.max(2, (val / 255) * 60);
    bars[i].style.height = `${height}px`;
    bars[i].style.backgroundColor = color;
    bars[i].style.opacity = 0.5 + (val / 255) * 0.5;
  }
}

// ===== PSTN Dial =====
async function dialPSTN() {
  const number = document.getElementById("pstn-number").value;
  if (!number) return alert("Enter a phone number");

  try {
    addTranscript("system", `Dialing ${number} via Twilio...`);
    // This would call a server endpoint; placeholder
    addTranscript("system", "PSTN outbound: configure Twilio webhook at /sip/twiml/inbound");
  } catch (e) {
    addTranscript("system", `Dial error: ${e.message}`);
  }
}