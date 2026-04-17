import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({ page, pageSize, total, onPrev, onNext }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between border-t border-border/60 px-4 py-2.5"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground tabular">
        {total === 0 ? "0 results" : `${from}\u2013${to} / ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onPrev}
          disabled={page <= 1}
          aria-label="Previous page"
          className="min-w-[44px] min-h-[32px] sm:min-w-0 sm:min-h-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground tabular px-2 min-w-[3.5rem] text-center">
          {String(page).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="min-w-[44px] min-h-[32px] sm:min-w-0 sm:min-h-0"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
