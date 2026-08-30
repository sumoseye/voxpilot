/**
 * LiveKit WebRTC Browser Client — Safe SDK loader & call handling
 */

let currentRoom = null;
let audioContext = null;
let userAnalyser = null;
let agentAnalyser = null;
let vizInterval = null;

// Helper to safely get the LiveKit global object
function getLiveKitSDK() {
  return (
    window.LivekitClient ||
    window.LiveKitClient ||
    window.Livekit ||
    window.livekit ||
    null
  );
}

async function startCall() {
  const roomName = document.getElementById("room-input").value || "vox-demo";
  const identity = document.getElementById("identity-input").value || "caller-1";

  const LK = getLiveKitSDK();
  if (!LK) {
    setCallStatus("error", "SDK MISSING");
    addTranscript(
      "system",
      "Error: LiveKit SDK failed to load. Please check your internet connection or script tag."
    );
    return;
  }

  setCallStatus("connecting", "CONNECTING...");

  try {
    const resp = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomName, identity: identity }),
    });

    if (!resp.ok) {
      throw new Error(`Token endpoint returned status ${resp.status}`);
    }

    const { token, livekit_url } = await resp.json();

    currentRoom = new LK.Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
    });

    currentRoom.on(LK.RoomEvent.Connected, () => {
      setCallStatus("live", "CONNECTED");
      addTranscript("system", `Connected to room: ${roomName}`);
    });

    currentRoom.on(LK.RoomEvent.Disconnected, () => {
      setCallStatus("idle", "DISCONNECTED");
      addTranscript("system", "Disconnected from room");
      cleanup();
    });

    currentRoom.on(LK.RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind === LK.Track.Kind.Audio) {
        const el = track.attach();
        el.id = "agent-audio";
        el.style.display = "none";
        document.body.appendChild(el);
        setupAgentViz(el);
        addTranscript("system", "Agent audio track received");
      }
    });

    currentRoom.on(LK.RoomEvent.DataReceived, (payload, participant) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "transcript") {
          addTranscript(msg.role || "agent", msg.text);
        }
        if (msg.type === "metrics") {
          updateCallMetrics(msg);
        }
      } catch (e) {
        /* ignore non-json data */
      }
    });

    currentRoom.on(LK.RoomEvent.TrackMuted, (pub, participant) => {
      if (!participant.isLocal) {
        addTranscript("system", "⚡ Agent speech interrupted (barge-in)");
      }
    });

    await currentRoom.connect(livekit_url, token);
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
  el.className = `badge badge--${
    state === "live" ? "live" : state === "error" ? "error" : "idle"
  }`;
}

function addTranscript(role, text) {
  const log = document.getElementById("transcript-log");
  const placeholder = log.querySelector(".italic");
  if (placeholder) placeholder.remove();

  const colors = {
    user: "bg-nb-pistachio text-nb-black border-2 border-nb-border px-1.5 py-0.5",
    agent: "bg-nb-powder text-nb-black border-2 border-nb-border px-1.5 py-0.5",
    system: "bg-nb-canvas text-nb-muted border-2 border-nb-border px-1.5 py-0.5",
    tool: "bg-nb-butter text-nb-black border-2 border-nb-border px-1.5 py-0.5",
  };

  const div = document.createElement("div");
  div.className = `flex items-center gap-3 p-2 bg-nb-surface border-2 border-nb-border shadow-[2px_2px_0px_0px_#121212] ${
    role === "system" ? "opacity-75" : ""
  }`;
  div.innerHTML = `
    <span class="${
      colors[role] || "bg-nb-canvas text-nb-black"
    } text-[10px] font-bold uppercase shrink-0">
      ${role}
    </span>
    <span class="text-nb-black text-xs font-semibold flex-1">${text}</span>
    <span class="text-nb-muted text-[10px] shrink-0 font-bold">${timeNow()}</span>
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

// ===== Visualizers =====

function setupUserViz() {
  const container = document.getElementById("user-viz");
  container.innerHTML = "";
  for (let i = 0; i < 32; i++) {
    const bar = document.createElement("div");
    bar.className = "viz-bar flex-1";
    bar.style.height = "3px";
    bar.style.backgroundColor = "#121212";
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
  for (let i = 0; i < 32; i++) {
    const bar = document.createElement("div");
    bar.className = "viz-bar flex-1";
    bar.style.height = "3px";
    bar.style.backgroundColor = "#121212";
    container.appendChild(bar);
  }

  try {
    if (!audioContext)
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
    renderViz("user-viz", userAnalyser, "#A7D5AF");
    renderViz("agent-viz", agentAnalyser, "#B5D0E0");
  }, 50);
}

function renderViz(containerId, analyser, activeColor) {
  if (!analyser) return;
  const container = document.getElementById(containerId);
  const bars = container.children;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  for (let i = 0; i < bars.length; i++) {
    const idx = Math.floor((i / bars.length) * data.length);
    const val = data[idx] || 0;
    const height = Math.max(3, (val / 255) * 52);
    bars[i].style.height = `${height}px`;
    bars[i].style.backgroundColor = val > 15 ? activeColor : "#121212";
  }
}

async function dialPSTN() {
  const number = document.getElementById("pstn-number").value;
  if (!number) return alert("Enter a phone number");
  addTranscript("system", `Dialing ${number} via Twilio SIP...`);
}