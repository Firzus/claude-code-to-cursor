"use client";

import { useGSAP } from "@gsap/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { ensureGsapPlugins, gsap, withReducedMotion } from "~/lib/motion";

interface AuroraShaderProps {
  className?: string;
  /** Optional intensity multiplier (0..1). Default: 1. */
  intensity?: number;
}

/**
 * Ambient Aurora background. Uses three radial CSS blobs that drift slowly via
 * transform. The component pauses when off-screen via IntersectionObserver to
 * spare the GPU, and disables motion entirely under
 * `prefers-reduced-motion: reduce`.
 *
 * Pointer-events are disabled so it never blocks interactions.
 */
export function AuroraShader({ className, intensity = 1 }: AuroraShaderProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { rootMargin: "0px", threshold: 0 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useGSAP(
    () => {
      ensureGsapPlugins();
      const node = wrapRef.current;
      if (!node) return;
      const blobs = node.querySelectorAll<HTMLElement>("[data-aurora-blob]");
      if (!blobs.length) return;

      const tweens: gsap.core.Tween[] = [];
      const cleanup = withReducedMotion((isMotion) => {
        if (!isMotion) return;
        blobs.forEach((blob, i) => {
          // Provide explicit `from` values so GSAP doesn't have to call
          // `getComputedStyle` for each animated prop on the first tick —
          // `_getComputedProperty` was the dominant forced-reflow culprit
          // (~100ms cumulative across 3 blobs × 3 props).
          tweens.push(
            gsap.fromTo(
              blob,
              { xPercent: 0, yPercent: 0, scale: 1 },
              {
                xPercent: i % 2 === 0 ? 6 : -8,
                yPercent: i % 2 === 0 ? -4 : 6,
                scale: 1.06,
                duration: 14 + i * 4,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut",
                paused: !visible,
              },
            ),
          );
        });
      });
      return () => {
        for (const t of tweens) t.kill();
        cleanup();
      };
    },
    { scope: wrapRef, dependencies: [visible] },
  );

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        "[mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_100%)]",
        className,
      )}
      style={{ opacity: intensity }}
    >
      <span
        data-aurora-blob
        className="absolute -top-32 -left-24 size-[42rem] rounded-full bg-aurora-1/55 blur-[80px]"
      />
      <span
        data-aurora-blob
        className="absolute -top-24 right-0 size-[36rem] rounded-full bg-aurora-2/50 blur-[88px]"
      />
      <span
        data-aurora-blob
        className="absolute top-12 right-1/4 size-[28rem] rounded-full bg-aurora-3/45 blur-[72px]"
      />
    </div>
  );
}
