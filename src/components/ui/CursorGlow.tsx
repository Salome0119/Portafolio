"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * CursorGlow
 * ------------------------------------------------------------------
 * Resplandor (glow) que sigue al puntero en escritorio + anillo
 * interactivo. Se desactiva en dispositivos táctiles y con
 * prefers-reduced-motion.
 */
export default function CursorGlow() {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const ringX = useSpring(x, { stiffness: 1200, damping: 32, mass: 0.3 });
  const ringY = useSpring(y, { stiffness: 1200, damping: 32, mass: 0.3 });
  const [enabled, setEnabled] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    setEnabled(true);
    document.documentElement.classList.add("cursor-none");

    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const target = e.target as HTMLElement | null;
      setHovering(
        !!target?.closest("a, button, input, textarea, select, [role='button'], .glow-card"),
      );
    };
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    const onLeave = () => {
      x.set(-200);
      y.set(-200);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("cursor-none");
      setPressed(false);
      setHovering(false);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <>
      <motion.div
        aria-hidden
        className="cursor-halo pointer-events-none fixed top-0 left-0 z-0 h-[840px] w-[840px] rounded-full"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[100] h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_3px_rgba(16,185,129,0.75)]"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[99] rounded-full border border-emerald-400/60"
        animate={{
          width: pressed ? 26 : hovering ? 52 : 36,
          height: pressed ? 26 : hovering ? 52 : 36,
          opacity: pressed ? 1 : 0.75,
          borderColor: hovering
            ? "rgba(52,211,153,0.95)"
            : "rgba(16,185,129,0.5)",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        style={{ x: ringX, y: ringY, translateX: "-50%", translateY: "-50%" }}
      />
    </>
  );
}
