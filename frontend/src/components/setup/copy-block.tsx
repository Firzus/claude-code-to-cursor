import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
        {value}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-muted-foreground opacity-0 transition-all group-hover:opacity-100 focus:opacity-100 hover:text-foreground cursor-pointer"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}
