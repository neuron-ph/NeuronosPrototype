import { supabase } from "./supabase/client";

export interface DepartmentRoleRecord {
  id: string;
  department: string;
  role_key: string;
  role_label: string;
  required: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface DepartmentRoleQueryResult {
  roles: DepartmentRoleRecord[];
  supportsRequired: boolean;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function isDepartmentRolesRequiredColumnMissing(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("department_assignment_roles") &&
    message.includes("required") &&
    (message.includes("schema cache") || message.includes("column"))
  );
}

export async function fetchDepartmentRoles(
  department: string,
): Promise<DepartmentRoleQueryResult> {
  const primary = await supabase
    .from("department_assignment_roles")
    .select("id, department, role_key, role_label, required, sort_order, is_active")
    .eq("department", department)
    .eq("is_active", true)
    .order("sort_order");

  if (!primary.error) {
    return {
      roles: (primary.data ?? []) as DepartmentRoleRecord[],
      supportsRequired: true,
    };
  }

  if (!isDepartmentRolesRequiredColumnMissing(primary.error)) {
    throw primary.error;
  }

  const fallback = await supabase
    .from("department_assignment_roles")
    .select("id, department, role_key, role_label, sort_order, is_active")
    .eq("department", department)
    .eq("is_active", true)
    .order("sort_order");

  if (fallback.error) throw fallback.error;

  return {
    roles: ((fallback.data ?? []) as Array<Omit<DepartmentRoleRecord, "required">>).map((role) => ({
      ...role,
      required: false,
    })),
    supportsRequired: false,
  };
}

export async function insertDepartmentRole(params: {
  department: string;
  role_key: string;
  role_label: string;
  required: boolean;
  sort_order: number;
}): Promise<{ supportsRequired: boolean }> {
  const primary = await supabase.from("department_assignment_roles").insert({
    department: params.department,
    role_key: params.role_key,
    role_label: params.role_label,
    required: params.required,
    sort_order: params.sort_order,
    is_active: true,
  });

  if (!primary.error) return { supportsRequired: true };
  if (!isDepartmentRolesRequiredColumnMissing(primary.error)) throw primary.error;

  const fallback = await supabase.from("department_assignment_roles").insert({
    department: params.department,
    role_key: params.role_key,
    role_label: params.role_label,
    sort_order: params.sort_order,
    is_active: true,
  });

  if (fallback.error) throw fallback.error;
  return { supportsRequired: false };
}

export async function updateDepartmentRole(params: {
  id: string;
  role_label: string;
  required: boolean;
}): Promise<{ supportsRequired: boolean }> {
  const primary = await supabase
    .from("department_assignment_roles")
    .update({
      role_label: params.role_label,
      required: params.required,
    })
    .eq("id", params.id);

  if (!primary.error) return { supportsRequired: true };
  if (!isDepartmentRolesRequiredColumnMissing(primary.error)) throw primary.error;

  const fallback = await supabase
    .from("department_assignment_roles")
    .update({
      role_label: params.role_label,
    })
    .eq("id", params.id);

  if (fallback.error) throw fallback.error;
  return { supportsRequired: false };
}
