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
    registered = true;
  }
  return gsap;
}

export { gsap, ScrollTrigger, SplitText };
