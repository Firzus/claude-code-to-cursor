"use client";

import { useGSAP } from "@gsap/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { ensureGsapPlugins, gsap } from "~/lib/motion";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const sunRef = useRef<HTMLSpanElement>(null);
  const moonRef = useRef<HTMLSpanElement>(null);
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  useGSAP(
    () => {
      if (!mounted) return;
      ensureGsapPlugins();
      const sun = sunRef.current;
      const moon = moonRef.current;
      if (!sun || !moon) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { isMotion } = ctx.conditions as { isMotion: boolean };
          const showSun = isDark;
          if (!isMotion) {
            gsap.set(sun, { autoAlpha: showSun ? 1 : 0, rotation: 0, scale: 1 });
            gsap.set(moon, { autoAlpha: showSun ? 0 : 1, rotation: 0, scale: 1 });
            return;
          }
          const tl = gsap.timeline({ defaults: { duration: 0.22, ease: "back.out(1.7)" } });
          if (showSun) {
            tl.to(moon, { autoAlpha: 0, rotation: -90, scale: 0.6, duration: 0.16 }, 0).fromTo(
              sun,
              { autoAlpha: 0, rotation: 90, scale: 0.6 },
              { autoAlpha: 1, rotation: 0, scale: 1 },
              0.05,
            );
          } else {
            tl.to(sun, { autoAlpha: 0, rotation: 90, scale: 0.6, duration: 0.16 }, 0).fromTo(
              moon,
              { autoAlpha: 0, rotation: -90, scale: 0.6 },
              { autoAlpha: 1, rotation: 0, scale: 1 },
              0.05,
            );
          }
        },
      );
      return () => mm.revert();
    },
    { dependencies: [mounted, isDark] },
  );

  function handleToggle() {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme-switching", "");
      window.setTimeout(() => {
        document.documentElement.removeAttribute("data-theme-switching");
      }, 60);
    }
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative text-muted-foreground hover-only:hover:text-foreground"
    >
      <span className="relative inline-flex size-4 items-center justify-center" aria-hidden="true">
        <span
          ref={sunRef}
          className="absolute inset-0 inline-flex items-center justify-center opacity-0"
          style={{ visibility: mounted && isDark ? "visible" : "hidden" }}
        >
          <Sun className="size-4" />
        </span>
        <span
          ref={moonRef}
          className="absolute inset-0 inline-flex items-center justify-center"
          style={{ opacity: !mounted ? 0 : isDark ? 0 : 1 }}
        >
          <Moon className="size-4" />
        </span>
      </span>
    </Button>
  );
}
