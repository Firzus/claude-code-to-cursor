import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "~/lib/utils";

const inputVariants = cva(
  [
    "w-full bg-input/80 font-mono text-[13px] text-foreground",
    "placeholder:text-muted-foreground/70",
    "border border-border/80 rounded-md",
    "transition-[border-color,background-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-quart)]",
    "focus-visible:border-foreground/50",
    "disabled:cursor-not-allowed disabled:opacity-40",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-7 px-2.5",
        default: "h-9 px-3",
        lg: "h-10 px-3.5 text-[14px]",
      },
      invalid: {
        true: "border-destructive/60 focus-visible:border-destructive",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size">;

export interface InputProps extends NativeInputProps, VariantProps<typeof inputVariants> {
  /** Optional leading visual (icon, prompt `>`). Gets 16px reserved space. */
  leading?: ReactNode;
  /** Optional trailing visual (icon, caret blink). */
  trailing?: ReactNode;
  /** Wrapper className (for layout spacing). Keep input-specific styles on `className`. */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      wrapperClassName,
      size,
      invalid,
      leading,
      trailing,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const invalidFlag = invalid ?? Boolean(ariaInvalid);

    if (!leading && !trailing) {
      return (
        <input
          ref={ref}
          aria-invalid={invalidFlag || undefined}
          className={cn(inputVariants({ size, invalid: invalidFlag }), className)}
          {...props}
        />
      );
    }

    return (
      <div className={cn("group relative flex items-center", wrapperClassName)}>
        {leading && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 flex items-center text-muted-foreground"
          >
            {leading}
          </span>
        )}
        <input
          ref={ref}
          aria-invalid={invalidFlag || undefined}
          className={cn(
            inputVariants({ size, invalid: invalidFlag }),
            leading && "pl-9",
            trailing && "pr-9",
            className,
          )}
          {...props}
        />
        {trailing && (
          <span className="pointer-events-none absolute right-3 flex items-center text-muted-foreground">
            {trailing}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { inputVariants };
