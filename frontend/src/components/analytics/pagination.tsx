interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({ page, pageSize, total, onPrev, onNext }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
      <span className="font-mono text-[12px] text-muted-foreground tabular">
        {total === 0 ? "0 results" : `${from}\u2013${to} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          aria-label="Previous page"
          className="rounded border border-border px-2 py-0.5 font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          &larr;
        </button>
        <span className="font-mono text-[12px] text-muted-foreground tabular px-2">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="rounded border border-border px-2 py-0.5 font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          &rarr;
        </button>
      </div>
    </div>
  );
}
