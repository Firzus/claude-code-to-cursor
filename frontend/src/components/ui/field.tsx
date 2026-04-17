import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useId,
  useMemo,
} from "react";
import { cn } from "~/lib/utils";
import { Label, type LabelProps } from "./label";

interface FieldContextValue {
  id: string;
  descriptionId: string | undefined;
  messageId: string | undefined;
  invalid: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldControl() {
  const ctx = useContext(FieldContext);
  if (!ctx) {
    return {
      id: undefined,
      "aria-describedby": undefined,
      "aria-invalid": undefined,
      disabled: undefined,
    } as const;
  }
  return {
    id: ctx.id,
    "aria-describedby": [ctx.descriptionId, ctx.messageId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": ctx.invalid || undefined,
    disabled: ctx.disabled || undefined,
  } as const;
}

interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode;
  labelVariant?: LabelProps["variant"];
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Show the `$` / `//` prefix baked into the Label. Defaults to `eyebrow`. */
  children: ReactNode;
}

/**
 * Accessible wrapper that wires label ↔ input ↔ description ↔ error via
 * aria attributes. Consume `useFieldControl()` from the control inside.
 */
export function Field({
  label,
  labelVariant = "eyebrow",
  description,
  error,
  required,
  disabled,
  className,
  children,
  ...props
}: FieldProps) {
  const id = useId();
  const descId = useId();
  const errId = useId();
  const invalid = Boolean(error);

  const value = useMemo<FieldContextValue>(
    () => ({
      id,
      descriptionId: description ? descId : undefined,
      messageId: invalid ? errId : undefined,
      invalid,
      disabled: Boolean(disabled),
    }),
    [id, descId, errId, description, invalid, disabled],
  );

  return (
    <FieldContext.Provider value={value}>
      <div className={cn("space-y-1.5", className)} {...props}>
        {label && (
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={id} variant={labelVariant} required={required}>
              {label}
            </Label>
            {description && labelVariant !== "eyebrow" && (
              <span id={descId} className="text-[11px] text-muted-foreground/70 font-mono">
                {description}
              </span>
            )}
          </div>
        )}
        {children}
        {description && labelVariant === "eyebrow" && (
          <p id={descId} className="text-[11px] text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
        {error && (
          <p
            id={errId}
            role="alert"
            className="font-mono text-[11px] text-destructive leading-relaxed flex items-start gap-1.5"
          >
            <span aria-hidden="true">↳</span>
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
