import { Switch } from "~/components/ui/switch";

interface ToggleAsciiProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

/**
 * ASCII on/off toggle used on Settings. Preserves the public API used in tests
 * (`checked`, `onChange`, `ariaLabel`) while routing through the shared
 * `Switch` primitive.
 */
export function ToggleAscii({ checked, onChange, ariaLabel }: ToggleAsciiProps) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
      ascii
      size="default"
    />
  );
}
