import { Check, Copy } from "lucide-react";
import { type HTMLAttributes, type ReactNode, useState } from "react";
import { cn } from "~/lib/utils";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

interface InlineCodeProps extends HTMLAttributes<HTMLElement> {}

export function Code({ className, ...props }: InlineCodeProps) {
  return (
    <code
      className={cn(
        "rounded-sm border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-foreground",
        className,
      )}
      {...props}
    />
  );
}

interface CodeBlockProps {
  value: string;
  label?: ReactNode;
  /** Terminal prompt character rendered before the value (e.g. `$`). */
  prompt?: string;
  /** If true, renders `value` as pre-formatted multi-line code. */
  multiline?: boolean;
  copyable?: boolean;
  className?: string;
  /** Auxiliary subtitle rendered under the value (used by ConfigField-style rows). */
  sub?: ReactNode;
}

/**
 * Unified copy-aware code block. Covers both the setup `CopyBlock` and the
 * `ConfigField` use cases. Single source of truth for the terminal-style $-prompt.
 */
export function CodeBlock({
  value,
  label,
  prompt,
  multiline = false,
  copyable = true,
  className,
  sub,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }

  return (
    <div
      data-surface="terminal"
      className={cn("group relative overflow-hidden font-mono", className)}
    >
      {label && (
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
          <span>{label}</span>
          {sub ? (
            <span className="text-muted-foreground/60 normal-case tracking-[0.1em]">{sub}</span>
          ) : (
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
          )}
        </div>
      )}
      <div className={cn("flex gap-2 px-3 py-2.5", multiline ? "items-start" : "items-center")}>
        {prompt && (
          <span aria-hidden="true" className="select-none text-accent text-[11px] leading-relaxed">
            {prompt}
          </span>
        )}
        {multiline ? (
          <pre className="flex-1 overflow-x-auto text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
            {value}
          </pre>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-foreground truncate" title={value}>
              {value}
            </div>
            {!label && sub && (
              <div className="text-[10.5px] text-muted-foreground/70 mt-0.5 normal-case">{sub}</div>
            )}
          </div>
        )}
        {copyable && (
          <Tooltip content={copied ? "copied" : "copy to clipboard"} side="top">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={copy}
              aria-label={copied ? "Copied" : "Copy to clipboard"}
              className={cn(
                "shrink-0 transition-opacity",
                !multiline && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                copied && "opacity-100 border-success/40 text-success",
              )}
            >
              {copied ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
