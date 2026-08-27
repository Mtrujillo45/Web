import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f6f4",
          100: "#e8eae4",
          600: "#4b5d3a",
          700: "#3c4a2e",
          800: "#2f3a24",
        },
      },
    },
  },
  plugins: [],
};

export default config;
