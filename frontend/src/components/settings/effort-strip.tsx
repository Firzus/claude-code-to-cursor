import { Segmented } from "~/components/ui/segmented";

interface EffortStripProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}

/**
 * Full-width segmented control for selecting thinking effort. Thin wrapper
 * over the shared `Segmented` primitive. Preserves the public API expected
 * by tests.
 */
export function EffortStrip<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: EffortStripProps<T>) {
  return (
    <Segmented<T>
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      ariaLabel="Thinking effort"
      size="default"
      fullWidth
    />
  );
}
