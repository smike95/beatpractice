/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    // only three text sizes in the whole interface: small (xs, sm), medium (base, lg, xl) and large (2xl and up)
    fontSize: {
      xs: ["15px", "20px"],
      sm: ["15px", "20px"],
      base: ["19px", "26px"],
      lg: ["19px", "26px"],
      xl: ["19px", "26px"],
      "2xl": ["28px", "34px"],
      "3xl": ["28px", "34px"],
      "4xl": ["28px", "34px"],
    },
    extend: {
      // accent colour: blue in the light theme, violet in the dark theme (see :root and html.light in index.css)
      colors: {
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
      borderRadius: {
        sm: "1px",
        DEFAULT: "2px",
        md: "3px",
        lg: "4px",
        xl: "6px",
        "2xl": "8px",
        "3xl": "12px",
      },
      boxShadow: {
        "2xs": "0 1px rgb(0 0 0 / 0.05)",
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
