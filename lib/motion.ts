"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

let registered = false;

export function ensureGsapPlugins(): typeof gsap {
  if (typeof window === "undefined") return gsap;
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    gsap.defaults({ duration: 0.6, ease: "power2.out" });
    // Mobile browsers fire resize events when their URL bar collapses/expands,
    // which would force ScrollTrigger to re-measure (`_refresh100vh`) and cause
    // forced reflows. Skip those resize-driven refreshes.
    ScrollTrigger.config({ ignoreMobileResize: true });
    registered = true;
  }
  return gsap;
}

/**
 * Centralizes the `gsap.matchMedia` boilerplate (registration + cleanup +
 * `isMotion` condition cast) that previously lived in 6+ components. The
 * setup callback receives `isMotion=false` when the user has requested
 * reduced motion, so callers can still set final state with duration 0
 * instead of skipping entirely.
 */
export function withReducedMotion(
  setup: (isMotion: boolean) => (() => void) | void,
): () => void {
  const mm = gsap.matchMedia();
  mm.add({ isMotion: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
    const conditions = ctx.conditions as { isMotion: boolean } | undefined;
    return setup(conditions?.isMotion ?? false);
  });
  return () => mm.revert();
}

export { gsap, ScrollTrigger, SplitText };
