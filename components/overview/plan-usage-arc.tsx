"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { ensureGsapPlugins, gsap, withReducedMotion } from "~/lib/motion";

interface PlanUsageArcProps {
  /** 0..100 */
  value: number;
  label: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Minimal half-arc gauge — animates stroke-dashoffset on mount and on value change.
 * Drawn as a 180-degree arc; thin stroke for the Aurora Mesh aesthetic.
 */
export function PlanUsageArc({ value, label, size = 220, strokeWidth = 6 }: PlanUsageArcProps) {
  const arcRef = useRef<SVGPathElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const arcLength = Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));

  const path = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  useGSAP(
    () => {
      ensureGsapPlugins();
      const arc = arcRef.current;
      if (!arc) return;
      const targetOffset = arcLength * (1 - clamped / 100);
      return withReducedMotion((isMotion) => {
        gsap.fromTo(
          arc,
          { strokeDashoffset: arcLength },
          {
            strokeDashoffset: targetOffset,
            duration: isMotion ? 0.9 : 0,
            ease: "power3.out",
            delay: 0.1,
          },
        );
      });
    },
    { scope: containerRef, dependencies: [clamped, arcLength] },
  );

  return (
    <div ref={containerRef} className="flex flex-col items-center text-center">
      <svg
        width={size}
        height={size / 2 + strokeWidth}
        viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}
        role="img"
        aria-label={`${label} usage: ${clamped.toFixed(1)}%`}
      >
        <title>{`${label} usage: ${clamped.toFixed(1)}%`}</title>
        <path
          d={path}
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
        <path
          ref={arcRef}
          d={path}
          stroke="var(--color-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={arcLength}
          strokeDashoffset={arcLength}
        />
      </svg>
      <div className="-mt-12 flex flex-col items-center">
        <span className="font-display text-5xl leading-none tabular tracking-tight">
          {clamped.toFixed(0)}
          <span className="font-sans text-2xl font-medium text-muted-foreground">%</span>
        </span>
      </div>
    </div>
  );
}
