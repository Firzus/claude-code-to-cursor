"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { cn } from "~/lib/cn";
import { ensureGsapPlugins, gsap, ScrollTrigger } from "~/lib/motion";

interface NumberTickerProps {
  value: number;
  /** Decimals to keep when rendering. Default: derived from `value` (0). */
  decimals?: number;
  /** Suffix appended after the number (e.g. "%", "k"). */
  suffix?: string;
  /** Prefix prepended before the number (e.g. "$"). */
  prefix?: string;
  /** Override the locale for `Intl.NumberFormat`. Default: undefined (system). */
  locale?: string;
  duration?: number;
  className?: string;
}

/**
 * Animates a number from 0 → value when the component enters the viewport.
 * Uses `Intl.NumberFormat` for locale-aware grouping and tabular nums for stability.
 * Honors `prefers-reduced-motion` — falls back to the static formatted value.
 */
export function NumberTicker({
  value,
  decimals,
  suffix,
  prefix,
  locale,
  duration = 1,
  className,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const fractionDigits = decimals ?? (Number.isInteger(value) ? 0 : 2);

  useGSAP(
    () => {
      ensureGsapPlugins();
      const node = ref.current;
      if (!node) return;

      const formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });

      const finalText = `${prefix ?? ""}${formatter.format(value)}${suffix ?? ""}`;

      const mm = gsap.matchMedia();
      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { isMotion } = ctx.conditions as { isMotion: boolean };
          if (!isMotion) {
            node.textContent = finalText;
            return;
          }

          const proxy = { current: 0 };
          const tween = gsap.to(proxy, {
            current: value,
            duration,
            ease: "power3.out",
            paused: true,
            onUpdate: () => {
              node.textContent = `${prefix ?? ""}${formatter.format(proxy.current)}${suffix ?? ""}`;
            },
            onComplete: () => {
              node.textContent = finalText;
            },
          });

          const trigger = ScrollTrigger.create({
            trigger: node,
            start: "top 90%",
            once: true,
            onEnter: () => tween.play(),
          });

          return () => {
            trigger.kill();
            tween.kill();
          };
        },
      );

      return () => mm.revert();
    },
    { scope: ref, dependencies: [value, fractionDigits, prefix, suffix, locale, duration] },
  );

  const initialFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const initialText = `${prefix ?? ""}${initialFormatter.format(0)}${suffix ?? ""}`;

  return (
    <span ref={ref} className={cn("tabular", className)} suppressHydrationWarning>
      {initialText}
    </span>
  );
}
