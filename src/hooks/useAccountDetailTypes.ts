import { useQuery } from "@tanstack/react-query";
import {
  fetchDetailTypeCatalog,
  BUILTIN_DETAIL_TYPES,
  type DetailTypeRow,
} from "../utils/accountingDetailTypes";

/**
 * The Detail Type catalog (from the account_detail_types table), used by the
 * account-creation picker. Falls back to the built-in list so the picker never
 * renders empty. Adding a row in Profiling → Detail Types makes it appear here.
 */
export function useAccountDetailTypes() {
  const query = useQuery({
    queryKey: ["account_detail_types"],
    queryFn: fetchDetailTypeCatalog,
    staleTime: 10 * 60 * 1000,
  });
  const catalog: DetailTypeRow[] =
    query.data && query.data.length > 0 ? query.data : BUILTIN_DETAIL_TYPES;
  return { catalog, isLoading: query.isLoading };
}
