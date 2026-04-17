import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Slot } from "./slot";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  [
    "group inline-flex items-center justify-center gap-2 font-mono font-medium select-none",
    "rounded-md whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out-quart)]",
    "disabled:pointer-events-none disabled:opacity-40 data-[loading=true]:cursor-wait",
    "[&_svg]:shrink-0 [&_svg]:pointer-events-none",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Primary CTA — light fill on dark bg */
        default: [
          "border border-foreground/80 bg-foreground text-background",
          "hover:shadow-[0_0_0_4px_oklch(from_var(--color-foreground)_l_c_h/0.12)]",
          "active:translate-y-px",
        ].join(" "),
        /** Accent / brand CTA */
        accent: [
          "border border-accent/60 bg-accent text-accent-foreground",
          "hover:shadow-[0_0_0_4px_oklch(from_var(--color-accent)_l_c_h/0.2)]",
          "active:translate-y-px",
        ].join(" "),
        /** Muted secondary — raised terminal panel look */
        secondary: [
          "border border-border/70 bg-card/40 text-foreground",
          "hover:border-border hover:bg-card/70",
        ].join(" "),
        /** Outline — less emphasis, flat ring */
        outline: [
          "border border-border/70 bg-transparent text-foreground",
          "hover:border-foreground/40 hover:bg-card/40",
        ].join(" "),
        /** Destructive — red fill */
        destructive: [
          "border border-destructive/60 bg-destructive text-destructive-foreground",
          "hover:shadow-[0_0_0_4px_oklch(from_var(--color-destructive)_l_c_h/0.2)]",
          "active:translate-y-px",
        ].join(" "),
        /** Ghost — no chrome until hover */
        ghost: [
          "border border-transparent bg-transparent text-muted-foreground",
          "hover:text-foreground hover:bg-card/50",
        ].join(" "),
        /** Pure text link */
        link: "border-transparent bg-transparent text-accent underline-offset-4 hover:underline",
        /** Terminal / ascii — for $ save-like actions inside terminal surfaces */
        terminal: [
          "border border-foreground/80 bg-foreground text-background uppercase tracking-[0.14em]",
          "hover:bg-foreground/95 hover:shadow-[0_0_0_4px_oklch(from_var(--color-foreground)_l_c_h/0.12)]",
          "active:translate-y-px",
        ].join(" "),
      },
      size: {
        xs: "h-6 px-2 text-[11px]",
        sm: "h-7 px-3 text-[12px]",
        default: "h-8 px-4 text-[13px]",
        md: "h-9 px-5 text-[13px]",
        lg: "h-10 px-5 text-[14px]",
        icon: "h-8 w-8 p-0 text-[13px]",
        "icon-sm": "h-7 w-7 p-0 text-[12px]",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as child element (e.g. an `<a>` or TanStack `<Link>`) while keeping button styles. */
  asChild?: boolean;
  /** Show a mono spinner before the children. Disables interaction automatically. */
  isLoading?: boolean;
  /** Content rendered when `isLoading` is true (replaces children). */
  loadingText?: ReactNode;
  /** Optional leading node (icon, caret, etc.). */
  leading?: ReactNode;
  /** Optional trailing node (icon, arrow, etc.). */
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild,
      type = "button",
      isLoading,
      loadingText,
      leading,
      trailing,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const compProps = asChild
      ? props
      : ({
          type,
          disabled: disabled ?? isLoading,
          ...props,
        } as ButtonHTMLAttributes<HTMLButtonElement>);

    return (
      <Comp
        ref={ref}
        data-loading={isLoading ? "true" : undefined}
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        {...compProps}
      >
        {isLoading ? <Spinner variant="braille" className="text-current" /> : leading}
        <span data-slottable="true" className="inline-flex items-center gap-1.5 leading-none">
          {isLoading && loadingText ? loadingText : children}
        </span>
        {!isLoading && trailing}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
