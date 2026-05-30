/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: "#030712",
          900: "#0d1117",
          800: "#0f1623",
          700: "#111827",
          600: "#1f2937",
          500: "#374151",
        },
      },
    },
  },
  plugins: [],
};
