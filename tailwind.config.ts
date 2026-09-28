import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(to right, #2563EB, #7C3AED, #E11D48)',
        'brand-gradient-diagonal': 'linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #E11D48 100%)',
      },
      colors: {
        brand: {
          blue: "#2563EB",
          violet: "#7C3AED",
          red: "#E11D48",
        },
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
