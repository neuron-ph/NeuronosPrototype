interface TablePaginationProps {
  /** 0-based current page. */
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
  /** Dims the footer while a page fetch is in flight. */
  isFetching?: boolean;
}

/**
 * Shared list-table footer: "Showing X–Y of N" + Prev / page / Next.
 * Style mirrors GroupedDataTable's per-group footer (border-top for use under a table).
 */
export function TablePagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  isFetching,
}: TablePaginationProps) {
  if (total === 0) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div
      className="flex items-center justify-between px-6 py-2"
      style={{
        backgroundColor: "var(--neuron-bg-page)",
        borderTop: "1px solid var(--neuron-ui-border)",
        opacity: isFetching ? 0.6 : 1,
      }}
    >
      <span className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2.5 py-1 rounded text-[11px] font-medium disabled:opacity-30"
          style={{ border: "1px solid var(--neuron-ui-border)", color: "var(--neuron-ink-muted)" }}
        >
          Prev
        </button>
        <span className="text-[11px] px-2" style={{ color: "var(--neuron-ink-muted)" }}>
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="px-2.5 py-1 rounded text-[11px] font-medium disabled:opacity-30"
          style={{ border: "1px solid var(--neuron-ui-border)", color: "var(--neuron-ink-muted)" }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
