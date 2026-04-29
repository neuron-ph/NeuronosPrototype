import { useQuery } from '@tanstack/react-query';
import {
  fetchDepartmentRoles,
  type DepartmentRoleQueryResult,
  type DepartmentRoleRecord,
} from '../utils/departmentAssignmentRoles';

export type DepartmentRole = DepartmentRoleRecord;
export type DepartmentRolesData = DepartmentRoleQueryResult;

export function useDepartmentRoles(department: string) {
  return useQuery<DepartmentRolesData>({
    queryKey: ['department_assignment_roles', department],
    enabled: !!department && department !== 'Operations',
    staleTime: 10 * 60 * 1000,
    queryFn: () => fetchDepartmentRoles(department),
  });
}
