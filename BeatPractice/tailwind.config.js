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
      // SF Pro is the system font of macOS (never embedded); other systems fall back to their own UI font
      fontFamily: {
        sans: ['"BP UI"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro"', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // accent colour: blue in the light theme, violet in the dark theme (see :root and html.light in index.css)
      colors: {
        // neutral greys of the Apple system (no blue tint): dark windows use 950..700, light ones are remapped in index.css
        slate: {
          50: "#f2f2f7", 100: "#e5e5ea", 200: "#d1d1d6", 300: "#c7c7cc", 400: "#aeaeb2", 500: "#8e8e93",
          600: "#636366", 700: "#48484a", 800: "#3a3a3c", 900: "#2c2c2e", 950: "#1c1c1e",
        },
        // system green: every Play button
        emerald: { 400: "#5fe07f", 500: "#30d158", 600: "#248a3d", 700: "#1d7233" },
        sky: {
        50: "rgb(var(--sky-50) / <alpha-value>)",
        100: "rgb(var(--sky-100) / <alpha-value>)",
        200: "rgb(var(--sky-200) / <alpha-value>)",
        300: "rgb(var(--sky-300) / <alpha-value>)",
        400: "rgb(var(--sky-400) / <alpha-value>)",
        500: "rgb(var(--sky-500) / <alpha-value>)",
        600: "rgb(var(--sky-600) / <alpha-value>)",
        700: "rgb(var(--sky-700) / <alpha-value>)",
        800: "rgb(var(--sky-800) / <alpha-value>)",
        900: "rgb(var(--sky-900) / <alpha-value>)",
        950: "rgb(var(--sky-950) / <alpha-value>)"
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
