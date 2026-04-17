import { CodeBlock } from "~/components/ui/code";

interface CopyBlockProps {
  value: string;
  label?: string;
}

/**
 * Setup-flow sample prompt block. Thin wrapper over the shared `CodeBlock`
 * primitive — kept as a named export for local clarity in setup.tsx.
 */
export function CopyBlock({ value, label }: CopyBlockProps) {
  return <CodeBlock value={value} label={label} prompt="$" multiline />;
}
