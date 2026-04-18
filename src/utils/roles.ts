export type Role = 'staff' | 'team_leader' | 'supervisor' | 'manager' | 'executive';

export const ROLE_LEVEL: Record<Role, number> = {
  staff: 0,
  team_leader: 1,
  supervisor: 2,
  manager: 3,
  executive: 4,
};

export function normalizeRole(role: string): Role {
  return (role in ROLE_LEVEL ? role : 'staff') as Role;
}

export function hasMinRole(userRole: string, minRole: Role): boolean {
  return ROLE_LEVEL[normalizeRole(userRole)] >= ROLE_LEVEL[minRole];
}
