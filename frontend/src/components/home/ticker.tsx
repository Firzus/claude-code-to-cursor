import { cn } from "~/lib/utils";

const items = [
  "proxy online",
  "opus 4.7",
  "sonnet 4.6",
  "haiku 4.5",
  "1M context",
  "4 cache breakpoints",
  "oauth 2.0 pkce",
  "sse streaming",
  "openai ↔ anthropic",
  "rate limit aware",
];

export function Ticker() {
  const loop = [...items, ...items];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative my-10 overflow-hidden border-y border-border/80 bg-card/30",
        "[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
      )}
    >
      <div className="flex w-max animate-[ticker_40s_linear_infinite] gap-10 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        {loop.map((item, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: duplicated loop with stable order
            key={i}
            className="flex items-center gap-3 whitespace-nowrap"
          >
            <span className="text-accent">■</span>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
