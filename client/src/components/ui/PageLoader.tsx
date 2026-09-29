import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Global route-level Suspense fallback.
 *
 * Design rules:
 * - Delayed reveal (120 ms) to suppress the "flash of loader" on fast networks.
 * - Poppins enforced via inline `style` — unaffected by locale RTL font stacks
 *   or any Tailwind utility that might win the cascade race.
 * - Smooth fade+translate entrance; ambient gradient progress bar for feedback.
 */
export default function PageLoader() {
  return (
    <motion.div
      className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4"
      /* Delay 120 ms before fading in — invisible for instant loads */
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: 0.12, ease: "easeOut" }}
    >
      {/* Ambient progress bar at top of loader area */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-[2px] w-full overflow-hidden"
      >
        <motion.div
          className="h-full w-full origin-left"
          style={{
            background:
              "linear-gradient(90deg, #2563EB 0%, #7C3AED 50%, #E11D48 100%)",
          }}
          initial={{ scaleX: 0, opacity: 0.6 }}
          animate={{ scaleX: [0, 0.6, 0.85, 1], opacity: [0.6, 1, 1, 0.4] }}
          transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center justify-center"
      >
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        <p
          className="mt-4 text-sm text-slate-500 dark:text-slate-400"
          /* Poppins hard-enforced — immune to locale RTL font overrides */
          style={{
            fontFamily: "'Poppins', system-ui, sans-serif",
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          Loading Module...
        </p>
      </motion.div>
    </motion.div>
  );
}

