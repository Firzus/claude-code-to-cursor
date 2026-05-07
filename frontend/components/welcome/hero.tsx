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
      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { isMotion } = ctx.conditions as { isMotion: boolean };
          if (!isMotion) {
            gsap.set(titleEl, { autoAlpha: 1 });
            return;
          }
          const split = new SplitText(titleEl, { type: "lines,words", linesClass: "lineChild" });
          gsap.set(titleEl, { autoAlpha: 1 });
          gsap.from(split.words, {
            yPercent: 110,
            opacity: 0,
            duration: 0.9,
            ease: "power3.out",
            stagger: 0.04,
          });
          return () => split.revert();
        },
      );
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [title] },
  );

  return (
    <div ref={containerRef} className="space-y-8">
      <span className="eyebrow inline-flex items-center gap-2">
        <span aria-hidden="true" className="h-px w-6 bg-foreground/40" /> {eyebrow}
      </span>
      <h1
        data-split
        className="font-display text-5xl leading-[0.98] tracking-tight text-balance opacity-0 md:text-7xl"
      >
        {title}
      </h1>
      <p className="max-w-xl text-pretty text-lg text-muted-foreground md:text-xl">{description}</p>
    </div>
  );
}
