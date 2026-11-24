/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    // HIG (macOS): the system font at 13 pt is the body size, 10 pt is the minimum. The interface keeps exactly three sizes:
    // small = Subheadline (11), medium = Body (13), large = Title 1 (22).
    fontSize: {
      xs: ["13px", "16px"],
      sm: ["13px", "16px"],
      base: ["15px", "20px"],
      lg: ["15px", "20px"],
      xl: ["15px", "20px"],
      "2xl": ["26px", "30px"],
      "3xl": ["26px", "30px"],
      "4xl": ["26px", "30px"],
    },
    extend: {
      // Jura is bundled with the app (see index.css) and is the font of ALL text, the "monospace" one too (its figures are all of one width); the system fonts only fill missing signs
      fontFamily: {
        sans: ['Jura Tabular', 'Jura', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['Jura Tabular', 'Jura', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      // accent colour: purple by default in both themes (see :root and html.light in index.css)
      colors: {
        // SEMANTIC NEUTRALS: every grey of the interface is one of these roles; both themes define their values in index.css
        // (--c-*), so a class is written once and means the right thing in the dark and in the light theme, also with opacity (bg-canvas/40).
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",            // the window; inputs and wells sunk into a card
        surface: "rgb(var(--c-surface) / <alpha-value>)",          // cards, panels, sidebar, dialogs
        control: {                                                  // buttons, segments, chips
          DEFAULT: "rgb(var(--c-control) / <alpha-value>)",
          hover: "rgb(var(--c-control-hover) / <alpha-value>)",     // hover and the chosen option
          active: "rgb(var(--c-control-active) / <alpha-value>)",   // pressed / strongest neutral fill
        },
        line: "rgb(var(--c-line) / <alpha-value>)",                // hairlines between and around blocks
        outline: "rgb(var(--c-outline) / <alpha-value>)",          // outlines of controls and fields
        ink: {                                                      // text
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",             // primary
          2: "rgb(var(--c-ink-2) / <alpha-value>)",                 // secondary
          3: "rgb(var(--c-ink-3) / <alpha-value>)",                 // muted
          4: "rgb(var(--c-ink-4) / <alpha-value>)",                 // faint (placeholders, disabled)
        },
        // system green: every Play button
        emerald: { 400: "#5fe07f", 500: "#30d158", 600: "#248a3d", 700: "#1d7233" },
        // the ONE accent of the interface (bg-accent, text-accent-text, border-accent, bg-accent/15 ...):
        // its values come from --accent* in index.css and are replaced when the accent is chosen in the interface
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          text: "rgb(var(--accent-text) / <alpha-value>)",
          on: "rgb(var(--accent-on) / <alpha-value>)",
        },
      },
      // corner radii are half of the Tailwind defaults (switches use rounded-full and stay round)
      // HIG: rounded rectangles with concentric radii (controls < grouped blocks < windows)
      borderRadius: {
        sm: "3px",
        DEFAULT: "4px",
        md: "5px",
        lg: "6px",
        xl: "8px",
        "2xl": "10px",
        "3xl": "14px",
      },
      boxShadow: {
        "2xs": "0 1px rgb(0 0 0 / 0.05)",
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
