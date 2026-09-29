import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function PageLoader() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center"
      >
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        <p className="mt-4 font-mono text-sm text-slate-500 dark:text-slate-400">
          Loading Module...
        </p>
      </motion.div>
    </div>
  );
}
