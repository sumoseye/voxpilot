/**
 * VoxPilot SPA Router — Neubrutalist Dark Theme
 * Pure vanilla JS, zero frameworks.
 */

// ===== SPA NAVIGATION =====
document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelectorAll(".nav-link[data-page]");
    const pages = document.querySelectorAll(".page");
  
    function navigate(pageName) {
      pages.forEach((p) => p.classList.remove("active"));
      navLinks.forEach((l) => l.classList.remove("active"));
  
      const target = document.getElementById(`page-${pageName}`);
      if (target) target.classList.add("active");
  
      const link = document.querySelector(`.nav-link[data-page="${pageName}"]`);
      if (link) link.classList.add("active");
  
      window.location.hash = pageName;
  
      // Trigger page-specific init
      if (pageName === "dashboard") initDashboard();
      if (pageName === "traces") loadTraces();
      if (pageName === "home") loadHomeStats();
    }
  
    navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(link.dataset.page);
      });
    });
  
    // Handle hash on load
    const hash = window.location.hash.replace("#", "") || "home";
    navigate(hash);
  
    // Load home stats
    loadHomeStats();
  });
  
  async function loadHomeStats() {
    try {
      const resp = await fetch("/api/config");
      const cfg = await resp.json();
  
      const el = (id) => document.getElementById(id);
      if (el("stat-asr")) el("stat-asr").textContent = "Nova3";
      if (el("stat-llm")) el("stat-llm").textContent = "Groq";
      if (el("stat-tts")) el("stat-tts").textContent = "Sonic2";
      if (el("stat-vad")) el("stat-vad").textContent = "500ms";
    } catch (e) {
      console.warn("Failed to load config:", e);
    }
  }
  
  // Utility: format ms
  function fmtMs(ms) {
    if (ms === null || ms === undefined) return "—";
    return Math.round(ms) + "";
  }
  
  // Utility: timestamp
  function timeNow() {
    return new Date().toLocaleTimeString("en-US", { hour12: false });
  }