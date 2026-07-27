"use client";

import { motion } from "framer-motion";
import { Clock3 } from "lucide-react";

export function PaymentWaitingVisual() {
  return (
    <div className="relative mx-auto grid size-28 place-items-center">
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-leaf/50 to-orange-soft"
        animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="glass relative grid size-20 place-items-center rounded-full text-forest"
        animate={{ rotate: [0, 4, -4, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Clock3 size={32} aria-hidden />
      </motion.div>
      <span className="sr-only">Ожидание оплаты</span>
    </div>
  );
}
