"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { ensureGsapPlugins, gsap, SplitText } from "~/lib/motion";

interface HeroProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function WelcomeHero({ eyebrow, title, description }: HeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      ensureGsapPlugins();
      const titleEl = containerRef.current?.querySelector<HTMLElement>("[data-split]");
      if (!titleEl) return;
      const mm = gsap.matchMedia();
      mm.add({ isMotion: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
        const { isMotion } = ctx.conditions as { isMotion: boolean };
        if (!isMotion) {
          gsap.set(titleEl, { autoAlpha: 1 });
          return;
        }
        const split = new SplitText(titleEl, { type: "lines,words", linesClass: "lineChild" });
        gsap.set(titleEl, { autoAlpha: 1 });
        gsap.from(split.words, {
          yPercent: 110,
          autoAlpha: 0,
          duration: 0.55,
          ease: "power3.out",
          stagger: 0.035,
        });
        return () => split.revert();
      });
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [title] },
  );

  return (
    <div ref={containerRef} className="space-y-8">
      <span className="eyebrow">{eyebrow}</span>
      <h1
        data-split
        className="font-display text-balance text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.96] opacity-0"
      >
        {title}
      </h1>
      <p className="max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg md:text-xl">
        {description}
      </p>
    </div>
  );
}
