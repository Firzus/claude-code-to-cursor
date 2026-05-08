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

export { gsap, ScrollTrigger, SplitText };
