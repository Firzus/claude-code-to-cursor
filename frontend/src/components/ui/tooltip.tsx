import {
  cloneElement,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

function flipSide(side: Side, anchor: DOMRect, tooltip: DOMRect, offset: number): Side {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  if (side === "top" && anchor.top - tooltip.height - offset < 8) return "bottom";
  if (side === "bottom" && anchor.bottom + tooltip.height + offset > viewportH - 8) return "top";
  if (side === "left" && anchor.left - tooltip.width - offset < 8) return "right";
  if (side === "right" && anchor.right + tooltip.width + offset > viewportW - 8) return "left";
  return side;
}

function axisStart(
  axis: "x" | "y",
  align: Align,
  anchor: DOMRect,
  tooltip: DOMRect,
  viewport: number,
): number {
  const isX = axis === "x";
  const start = isX ? anchor.left : anchor.top;
  const end = isX ? anchor.right : anchor.bottom;
  const size = isX ? tooltip.width : tooltip.height;
  const span = isX ? anchor.width : anchor.height;
  const raw =
    align === "start" ? start : align === "end" ? end - size : start + span / 2 - size / 2;
  return Math.max(8, Math.min(viewport - size - 8, raw));
}

function computePosition(
  anchor: DOMRect,
  tooltip: DOMRect,
  opts: { side: Side; align: Align; offset: number },
): { top: number; left: number; side: Side } {
  const actualSide = flipSide(opts.side, anchor, tooltip, opts.offset);
  const isVertical = actualSide === "top" || actualSide === "bottom";
  const top = isVertical
    ? actualSide === "top"
      ? anchor.top - tooltip.height - opts.offset
      : anchor.bottom + opts.offset
    : axisStart("y", opts.align, anchor, tooltip, window.innerHeight);
  const left = isVertical
    ? axisStart("x", opts.align, anchor, tooltip, window.innerWidth)
    : actualSide === "left"
      ? anchor.left - tooltip.width - opts.offset
      : anchor.right + opts.offset;
  return {
    top: top + window.scrollY,
    left: left + window.scrollX,
    side: actualSide,
  };
}

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: Side;
  align?: Align;
  delay?: number;
  offset?: number;
  className?: string;
  /** Force portal to a specific element (defaults to `document.body`). */
  container?: HTMLElement | null;
}

/**
 * Tiny, dependency-free tooltip. Renders into a portal so it never clips on
 * `overflow-hidden` ancestors. Opens on hover/focus, closes on blur/mouseleave/
 * Escape, and flips sides if the preferred side overflows the viewport.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delay = 120,
  offset = 8,
  className,
  container,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; side: Side } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | undefined>(undefined);

  const show = useCallback(() => {
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    window.clearTimeout(openTimer.current);
    setOpen(false);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(openTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tooltipRef.current) return;
    const next = computePosition(
      anchorRef.current.getBoundingClientRect(),
      tooltipRef.current.getBoundingClientRect(),
      { side, align, offset },
    );
    setPosition(next);
  }, [open, side, align, offset]);

  if (!isValidElement(children)) return children;
  const child = children as ReactElement<
    HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }
  >;
  const childProps = (child.props ?? {}) as HTMLAttributes<HTMLElement> & {
    ref?: React.Ref<HTMLElement>;
  };

  const composedChild = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const originalRef = childProps.ref as React.Ref<HTMLElement> | undefined;
      if (typeof originalRef === "function") originalRef(node);
      else if (originalRef && typeof originalRef === "object") {
        (originalRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      hide();
    },
    "aria-describedby": open ? id : childProps["aria-describedby"],
  } as Partial<HTMLAttributes<HTMLElement>>);

  const portalTarget = typeof document !== "undefined" ? (container ?? document.body) : null;

  return (
    <>
      {composedChild}
      {open && portalTarget
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id}
              role="tooltip"
              style={
                position
                  ? { position: "absolute", top: position.top, left: position.left }
                  : { position: "absolute", opacity: 0, pointerEvents: "none" }
              }
              className={cn(
                "z-[60] pointer-events-none max-w-xs rounded-md border border-border/70 bg-card/95 backdrop-blur-sm px-2.5 py-1.5",
                "font-mono text-[11px] tracking-[0.02em] text-foreground shadow-xl",
                "animate-fade-in",
                className,
              )}
            >
              {content}
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}
