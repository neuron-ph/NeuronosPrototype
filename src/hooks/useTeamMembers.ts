import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";

export function useTeamMembers(teamId: string | null | undefined): {
  memberIds: string[];
  isLoading: boolean;
} {
  const { data: memberIds = [], isLoading } = useQuery({
    queryKey: queryKeys.users.teamMembers(teamId ?? ""),
    queryFn: async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("user_id")
        .eq("team_id", teamId!)
        .eq("is_active", true);
      return data?.map((u) => u.user_id) ?? [];
    },
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
  });

  return { memberIds, isLoading };
}
