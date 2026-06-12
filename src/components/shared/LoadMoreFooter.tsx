interface LoadMoreFooterProps {
  loaded: number;
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  isFetching?: boolean;
}

/** "Showing N of M" + a Load more button for grouped list views. */
export function LoadMoreFooter({ loaded, total, hasMore, onLoadMore, isFetching }: LoadMoreFooterProps) {
  if (total === 0) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <span className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
        Showing {loaded} of {total}
      </span>
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isFetching}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
          style={{ border: "1px solid var(--neuron-ui-border)", color: "var(--neuron-ink-secondary)" }}
        >
          {isFetching ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
