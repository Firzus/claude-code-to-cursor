import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

const labelVariants = cva("select-none font-mono", {
  variants: {
    variant: {
      default: "text-[12px] text-foreground",
      eyebrow: "text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground",
      /** Terminal-style `$ label` prefix baked in */
      shell:
        "text-[11px] uppercase tracking-[0.18em] text-muted-foreground before:content-['$_'] before:text-accent",
      /** `// label` comment-style prefix */
      comment:
        "text-[11px] uppercase tracking-[0.18em] text-muted-foreground before:content-['//_'] before:text-muted-foreground/60",
    },
    required: {
      true: "after:ml-1 after:text-destructive after:content-['*']",
    },
  },
  defaultVariants: { variant: "eyebrow" },
});

export interface LabelProps
  extends LabelHTMLAttributes<HTMLLabelElement>,
    VariantProps<typeof labelVariants> {}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, variant, required, ...props }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor provided by consumer via props
    <label ref={ref} className={cn(labelVariants({ variant, required }), className)} {...props} />
  ),
);
Label.displayName = "Label";

export { labelVariants };
