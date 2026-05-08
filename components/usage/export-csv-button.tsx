"use client";

import { Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { RequestRecord } from "~/lib/schemas";

interface ExportCsvButtonProps {
  requests: RequestRecord[];
  disabled?: boolean;
}

const HEADERS = [
  "Date",
  "Model",
  "Source",
  "Input Tokens",
  "Output Tokens",
  "Cache Read",
  "Cache Write",
  "Thinking",
  "Latency (ms)",
  "Estimated USD",
  "Route",
  "Effort",
  "Error",
];

export function ExportCsvButton({ requests, disabled }: ExportCsvButtonProps) {
  function exportCsv() {
    const rows = requests.map((r) => [
      new Date(r.timestamp).toISOString(),
      r.model,
      r.source,
      r.inputTokens,
      r.outputTokens,
      r.cacheReadTokens ?? 0,
      r.cacheCreationTokens ?? 0,
      r.thinkingTokens ?? 0,
      r.latencyMs ?? "",
      r.estimatedUsd?.toFixed(4) ?? "",
      r.route ?? "",
      r.appliedThinkingEffort ?? "",
      r.error ?? "",
    ]);
    const csv = [HEADERS, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cctc-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={exportCsv}
      disabled={disabled || requests.length === 0}
    >
      <Download className="size-3.5" aria-hidden="true" />
      Export CSV
    </Button>
  );
}
