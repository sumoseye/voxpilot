/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./web/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        "nb-canvas": "#FAF7F2",    // Soft Warm Cream (Canvas)
        "nb-surface": "#FFFFFF",   // Pure White for Cards
        "nb-black": "#121212",     // Deep Black (Outlines & Text)
        "nb-pistachio": "#A7D5AF", // Pistachio Green (Primary Accent)
        "nb-powder": "#B5D0E0",    // Powder Blue (Secondary Accent)
        "nb-butter": "#F6E3A2",    // Butter Yellow (Highlight)
        "nb-border": "#121212",    // Strict Deep Black outlines
        "nb-muted": "#6E6D6A",     // Elegant charcoal gray for secondary text
      },
      fontFamily: {
        mono: ['"Space Mono"', "Consolas", "monospace"],
      },
      boxShadow: {
        "brutal-black": "4px 4px 0px 0px #121212",
        "brutal-double": "6px 6px 0px 0px #121212",
        "brutal-pistachio": "4px 4px 0px 0px #A7D5AF",
        "brutal-powder": "4px 4px 0px 0px #B5D0E0",
        "brutal-butter": "4px 4px 0px 0px #F6E3A2",
      },
      borderWidth: {
        3: "3px",
      },
    },
  },
  plugins: [],
};