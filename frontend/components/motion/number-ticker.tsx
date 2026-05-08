"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { cn } from "~/lib/cn";
import { gsap } from "~/lib/motion";

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
 *
 * Uses a native `IntersectionObserver` rather than `ScrollTrigger.create` so
 * that mounting many tickers does not register additional triggers (each one
 * forces a layout read on `ScrollTrigger.refresh`, which dominates the
 * forced-reflow budget on first render).
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
      const node = ref.current;
      if (!node) return;

      const formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });

      const finalText = `${prefix ?? ""}${formatter.format(value)}${suffix ?? ""}`;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
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

      let observer: IntersectionObserver | null = null;
      if (typeof IntersectionObserver === "undefined") {
        // SSR / unsupported: just play immediately rather than skipping.
        tween.play();
      } else {
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                tween.play();
                observer?.disconnect();
                observer = null;
                break;
              }
            }
          },
          // Approximates ScrollTrigger's `start: "top 90%"`: fire when the
          // element's top crosses 90% of the viewport from the top.
          { rootMargin: "0px 0px -10% 0px", threshold: 0 },
        );
        observer.observe(node);
      }

      return () => {
        observer?.disconnect();
        tween.kill();
      };
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
