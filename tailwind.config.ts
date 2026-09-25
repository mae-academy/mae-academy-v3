import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        dark: {
          background: "#000000",       // Pure true black for the deepest layer
          surface: "#090a0d",          // Neutral off-black (matches top navbar)
          card: "#0d0f12",             // Neutral charcoal card surface
          muted: "#13161c",            // Control backgrounds & inner input wells
          border: "#1b2028",           // Subtle non-blue borders
          borderHover: "#262c36",      // Focused / hover border states
        },
      },
    },
  },
} satisfies Config;
