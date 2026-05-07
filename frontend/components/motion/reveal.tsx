"use client";

import { useGSAP } from "@gsap/react";
import { type ReactNode, useRef } from "react";
import { cn } from "~/lib/cn";
import { ensureGsapPlugins, gsap } from "~/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  as?: "div" | "section" | "article" | "header" | "footer";
}

/**
 * Reveals children with a soft fade + lift, respecting prefers-reduced-motion.
 * Wraps children in a single block element; nesting Reveals inside Reveals is fine.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 8,
  duration = 0.5,
  as: Tag = "div",
}: RevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      ensureGsapPlugins();
      const node = containerRef.current;
      if (!node) return;
      const mm = gsap.matchMedia();
      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
          isReduced: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { isMotion } = ctx.conditions as { isMotion: boolean; isReduced: boolean };
          gsap.fromTo(
            node,
            { autoAlpha: 0, y: isMotion ? y : 0 },
            { autoAlpha: 1, y: 0, duration: isMotion ? duration : 0, delay, ease: "power2.out" },
          );
        },
      );
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [delay, y, duration] },
  );

  return (
    <Tag ref={containerRef as never} className={cn("opacity-0", className)}>
      {children}
    </Tag>
  );
}
