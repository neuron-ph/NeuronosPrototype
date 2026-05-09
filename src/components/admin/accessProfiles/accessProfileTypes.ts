export type ModuleGrants = Record<string, boolean>;
export type VisibilityScope = "own" | "team" | "department" | "selected_departments" | "all";

export interface AccessProfile {
  id: string;
  name: string;
  description: string | null;
  target_department: string | null;
  target_role: string | null;
  module_grants: ModuleGrants;
  visibility_scope: VisibilityScope | null;
  visibility_departments: string[] | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessProfileSummary {
  id: string;
  name: string;
  description: string | null;
  target_department: string | null;
  target_role: string | null;
  module_grants: ModuleGrants;
  visibility_scope: VisibilityScope | null;
  visibility_departments: string[] | null;
  updated_at: string;
}

export interface PermissionOverrideAccessSummary {
  user_id: string;
  module_grants: ModuleGrants | null;
  applied_profile_id: string | null;
  scope?: VisibilityScope | "department_wide" | "cross_department" | "full" | null;
  departments?: string[] | null;
  profile?: {
    id: string;
    name: string;
    visibility_scope?: VisibilityScope | null;
    visibility_departments?: string[] | null;
  } | null;
}
