import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * Syncs a selected entity ID to a URL search param so detail views
 * survive page refresh. Returns [currentId, setId].
 */
export function useUrlSelection(paramName: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get(paramName);

  const setSelectedId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set(paramName, id);
          else next.delete(paramName);
          return next;
        },
        { replace: true },
      );
    },
    [paramName, setSearchParams],
  );

  return [selectedId, setSelectedId] as const;
}
