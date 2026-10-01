import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F5F7FC",
        ink: "#27365D",
        panel: "#FFFFFF",
        line: "#E2E8F3",
        muted: "#76839D",
        dry: {
          DEFAULT: "#C6875A",
          soft: "#F1DDCB",
        },
        normal: {
          DEFAULT: "#6F9A6A",
          soft: "#DCEBD8",
        },
        oily: {
          DEFAULT: "#2F7189",
          soft: "#D3E6EB",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        scanline: "scanline 1.8s ease-in-out infinite",
        fadeUp: "fadeUp 0.5s ease-out forwards",
        pulseSoft: "pulseSoft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
