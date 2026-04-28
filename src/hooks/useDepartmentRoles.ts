import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';

export interface DepartmentRole {
  role_key:   string;
  role_label: string;
  sort_order: number;
}

export function useDepartmentRoles(department: string) {
  return useQuery<DepartmentRole[]>({
    queryKey: ['department_assignment_roles', department],
    enabled: !!department && department !== 'Operations',
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('department_assignment_roles')
        .select('role_key, role_label, sort_order')
        .eq('department', department)
        .eq('is_active', true)
        .order('sort_order');
      return (data ?? []) as DepartmentRole[];
    },
  });
}
