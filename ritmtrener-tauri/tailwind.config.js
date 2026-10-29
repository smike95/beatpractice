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
