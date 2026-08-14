import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Impact", "Haettenschweiler", "'Franklin Gothic Bold'", "'Arial Narrow'", "sans-serif"],
        pixel: ["'Press Start 2P'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
