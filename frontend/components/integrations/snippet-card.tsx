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
    <article className="group flex flex-col rounded-2xl border bg-card shadow-(--shadow-soft-sm) transition-shadow hover:shadow-(--shadow-soft-md)">
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="space-y-1">
          <h3 className="font-display text-lg leading-tight tracking-tight">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {pillLabel ? (
          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {pillLabel}
          </span>
        ) : null}
      </header>
      <div className="relative">
        <pre
          className={cn(
            "overflow-x-auto px-5 py-4 text-[12.5px] leading-relaxed",
            "bg-[oklch(from_var(--muted)_l_c_h_/_0.55)] font-mono text-foreground/90",
          )}
        >
          <code data-language={language}>{snippet}</code>
        </pre>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          className="absolute right-3 top-3 size-7 bg-card/80 backdrop-blur"
          aria-label="Copy snippet"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </article>
  );
}
