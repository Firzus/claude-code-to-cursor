"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/cn";

interface SnippetCardProps {
  title: string;
  description: string;
  language: string;
  snippet: string;
  pillLabel?: string;
}

export function SnippetCard({
  title,
  description,
  language,
  snippet,
  pillLabel,
}: SnippetCardProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_400);
    } catch {
      /* ignore */
    }
  }

  return (
    <article
      data-hover-target="border"
      className={cn(
        "group flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-(--shadow-soft-sm)",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out",
        "hover-only:hover:-translate-y-px hover-only:hover:border-primary/30 hover-only:hover:shadow-(--shadow-soft-md)",
        "focus-within:border-primary/30",
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="space-y-1 min-w-0">
          <h3 className="font-display text-lg leading-tight tracking-tight truncate">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {pillLabel ? (
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {pillLabel}
          </span>
        ) : null}
      </header>
      <div className="relative min-w-0">
        <pre
          className={cn(
            "min-w-0 overflow-x-auto px-5 py-4 text-[12.5px] leading-relaxed",
            "bg-[oklch(from_var(--muted)_l_c_h_/_0.55)] font-mono text-foreground/90",
            "rounded-b-2xl scroll-smooth",
          )}
        >
          <code data-language={language}>{snippet}</code>
        </pre>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          className={cn(
            "absolute right-3 top-3 size-7 bg-card/90 backdrop-blur-sm",
            "transition-transform duration-150 hover-only:hover:scale-105",
          )}
          aria-label={copied ? "Snippet copied" : "Copy snippet"}
        >
          <span className="relative inline-flex size-3.5 items-center justify-center">
            <Check
              aria-hidden="true"
              className={cn(
                "absolute inset-0 size-3.5 text-success transition-[transform,opacity] duration-200 ease-out",
                copied ? "opacity-100 scale-100" : "opacity-0 scale-50",
              )}
            />
            <Copy
              aria-hidden="true"
              className={cn(
                "absolute inset-0 size-3.5 transition-[transform,opacity] duration-200 ease-out",
                copied ? "opacity-0 scale-50" : "opacity-100 scale-100",
              )}
            />
          </span>
        </Button>
      </div>
    </article>
  );
}
