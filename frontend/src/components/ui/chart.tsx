import * as React from "react";
import { cn } from "~/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label: string;
    icon?: React.ComponentType;
    color?: string;
    theme?: { light: string; dark: string };
  }
>;

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within a ChartContainer");
  return ctx;
}

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
  children: React.ReactElement;
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ className, config, children, ...props }, ref) => {
    const innerRef = React.useRef<HTMLDivElement>(null);
    const size = useContainerSize(innerRef);

    const cssVars = React.useMemo(() => {
      const vars: Record<string, string> = {};
      for (const [key, value] of Object.entries(config)) {
        if (value.color) {
          vars[`--color-${key}`] = value.color;
        }
      }
      return vars;
    }, [config]);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref],
    );

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={setRefs}
          className={cn(
            "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/40",
            "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
            "[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border",
            "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/30",
            "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border",
            "[&_.recharts-sector[stroke='#fff']]:stroke-transparent",
            "[&_.recharts-sector]:outline-none",
            "[&_.recharts-surface]:outline-none",
            className,
          )}
          style={cssVars as React.CSSProperties}
          {...props}
        >
          {size && React.cloneElement(children, { width: size.width, height: size.height } as Record<string, unknown>)}
        </div>
      </ChartContext.Provider>
    );
  },
);
ChartContainer.displayName = "ChartContainer";

interface ChartTooltipContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    dataKey?: string;
    payload?: Record<string, unknown>;
    color?: string;
    fill?: string;
    stroke?: string;
  }>;
  label?: string;
  labelFormatter?: (label: string, payload: unknown[]) => React.ReactNode;
  nameKey?: string;
  labelKey?: string;
  indicator?: "dot" | "line" | "dashed";
  hideLabel?: boolean;
  hideIndicator?: boolean;
  formatter?: (
    value: number,
    name: string,
    item: unknown,
    index: number,
    payload: unknown,
  ) => React.ReactNode;
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  ChartTooltipContentProps
>(
  (
    {
      active,
      payload,
      label,
      labelFormatter,
      nameKey,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      className,
      formatter,
    },
    ref,
  ) => {
    const { config } = useChart();

    if (!active || !payload?.length) return null;

    const tooltipLabel = hideLabel ? null : (
      <div className="font-medium text-foreground">
        {labelFormatter ? labelFormatter(String(label), payload) : label}
      </div>
    );

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className,
        )}
      >
        {tooltipLabel}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = nameKey
              ? String(item.payload?.[nameKey] ?? item.name)
              : (item.dataKey as string) ?? item.name;
            const configEntry = key ? config[key] : undefined;
            const indicatorColor =
              item.fill || item.stroke || item.color || "var(--color-accent)";
            const displayName = configEntry?.label ?? key;

            return (
              <div
                key={`${key}-${index}`}
                className={cn(
                  "flex w-full items-center gap-2",
                  indicator === "dot" && "items-center",
                )}
              >
                {!hideIndicator && (
                  <div
                    className={cn("shrink-0 rounded-[2px]", {
                      "h-2.5 w-2.5": indicator === "dot",
                      "w-1 h-full min-h-[16px]": indicator === "line",
                      "w-0 border-[1.5px] border-dashed bg-transparent h-full min-h-[16px]":
                        indicator === "dashed",
                    })}
                    style={{ backgroundColor: indicatorColor, borderColor: indicatorColor }}
                  />
                )}
                <div className="flex flex-1 justify-between items-center leading-none">
                  <span className="text-muted-foreground">{displayName}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums ml-3">
                    {formatter
                      ? formatter(
                        item.value ?? 0,
                        String(key),
                        item,
                        index,
                        payload,
                      )
                      : (item.value ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltipContent";

export { ChartContainer, ChartTooltipContent, useChart };
