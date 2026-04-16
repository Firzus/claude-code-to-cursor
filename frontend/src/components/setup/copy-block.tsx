import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "~/lib/utils";

interface CopyBlockProps {
  value: string;
  label?: string;
}

export function CopyBlock({ value, label }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }

  return (
    <div className="group relative rounded-md border border-border/70 bg-background/60 font-mono">
      {label && (
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
          <span>{label}</span>
          <span aria-hidden="true">·</span>
        </div>
      )}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <span aria-hidden="true" className="text-accent text-[11px] leading-relaxed select-none">
          $
        </span>
        <pre className="flex-1 overflow-x-auto text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
          {value}
        </pre>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "shrink-0 flex h-6 w-6 items-center justify-center rounded border border-border/70 bg-card/40 text-muted-foreground",
            "opacity-0 transition-all group-hover:opacity-100 focus-visible:opacity-100",
            "hover:text-foreground hover:border-foreground/30 cursor-pointer",
          )}
          aria-label="Copy to clipboard"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
