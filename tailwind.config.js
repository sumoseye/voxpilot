/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./web/**/*.{html,js}"],
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          "nb-bg": "#0a0a0a",
          "nb-surface": "#141414",
          "nb-card": "#1a1a1a",
          "nb-border": "#2a2a2a",
          "nb-accent": "#00ff88",
          "nb-accent2": "#ff3366",
          "nb-accent3": "#6633ff",
          "nb-yellow": "#ffcc00",
          "nb-cyan": "#00ccff",
          "nb-text": "#e0e0e0",
          "nb-muted": "#666666",
        },
        fontFamily: {
          mono: ['"Space Mono"', "Consolas", "monospace"],
          brutal: ['"Space Mono"', "monospace"],
        },
        boxShadow: {
          brutal: "4px 4px 0px 0px #00ff88",
          "brutal-red": "4px 4px 0px 0px #ff3366",
          "brutal-purple": "4px 4px 0px 0px #6633ff",
          "brutal-yellow": "4px 4px 0px 0px #ffcc00",
          "brutal-lg": "6px 6px 0px 0px #00ff88",
        },
        borderWidth: {
          3: "3px",
        },
      },
    },
    plugins: [],
  };