import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import type { User } from "./useUser";

export interface UseUsersOptions {
  department?: User["department"];
  role?: User["role"];
  service_type?: User["service_type"];
  operations_role?: User["operations_role"];
  enabled?: boolean;
}

export interface UseUsersResult {
  users: User[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUsers(options: UseUsersOptions = {}): UseUsersResult {
  const { department, role, service_type, operations_role, enabled = true } = options;

  const { data: users = [], isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.users.filtered({
      department: department || undefined,
      role: role || undefined,
      service_type: service_type || undefined,
      operations_role: operations_role || undefined,
    }),
    queryFn: async () => {
      let query = supabase
        .from("users")
        .select("id, name, email, department, role, is_active, service_type, operations_role, created_at")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (department) query = query.eq("department", department);
      if (role) query = query.eq("role", role);
      if (service_type) query = query.eq("service_type", service_type);
      if (operations_role) query = query.eq("operations_role", operations_role);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      return (data as User[]) || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    users,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch: () => { refetch(); },
  };
}
