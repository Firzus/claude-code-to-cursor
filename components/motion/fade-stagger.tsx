"use client";

import { useGSAP } from "@gsap/react";
import { type ReactNode, useRef } from "react";
import { cn } from "~/lib/cn";
import { ensureGsapPlugins, gsap } from "~/lib/motion";

interface FadeStaggerProps {
  children: ReactNode;
  className?: string;
  /** Selector for child items relative to the wrapper. Default: direct children. */
  selector?: string;
  stagger?: number;
  y?: number;
  duration?: number;
  delay?: number;
}

/**
 * Stagger-fades a list of items. Wraps children in a single block;
 * each direct child (or matching selector) animates in sequence.
 */
export function FadeStagger({
  children,
  className,
  selector = ":scope > *",
  stagger = 0.06,
  y = 8,
  duration = 0.5,
  delay = 0,
}: FadeStaggerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      ensureGsapPlugins();
      const node = containerRef.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(selector));
      if (items.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { isMotion } = ctx.conditions as { isMotion: boolean };
          gsap.fromTo(
            items,
            { autoAlpha: 0, y: isMotion ? y : 0 },
            {
              autoAlpha: 1,
              y: 0,
              duration: isMotion ? duration : 0,
              ease: "power2.out",
              stagger: isMotion ? stagger : 0,
              delay,
            },
          );
        },
      );
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [stagger, y, duration, delay, selector] },
  );

  return (
    <div ref={containerRef} className={cn(className)}>
      {children}
    </div>
  );
}
