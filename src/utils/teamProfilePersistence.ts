import { supabase } from "./supabase/client";
import type {
  UpsertContactTeamOverrideInput,
  UpsertCustomerTeamProfileInput,
} from "../types/bd";

function applyNullableFilter(query: any, column: string, value: string | null | undefined) {
  return value == null ? query.is(column, null) : query.eq(column, value);
}

export async function upsertCustomerTeamProfile(input: UpsertCustomerTeamProfileInput) {
  let matchQuery = supabase
    .from("customer_team_profiles")
    .select("id")
    .eq("customer_id", input.customer_id)
    .eq("department", input.department)
    .limit(1);

  matchQuery = applyNullableFilter(matchQuery, "service_type", input.service_type);
  matchQuery = applyNullableFilter(matchQuery, "team_id", input.team_id);

  const { data: existing, error: matchError } = await matchQuery.maybeSingle();
  if (matchError) throw matchError;

  const row = {
    customer_id: input.customer_id,
    department: input.department,
    service_type: input.service_type ?? null,
    team_id: input.team_id ?? null,
    team_name: input.team_name ?? null,
    assignments: input.assignments,
    notes: input.notes ?? null,
    updated_by: input.updated_by ?? null,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("customer_team_profiles")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("customer_team_profiles").insert({
    ...row,
    created_by: input.updated_by ?? null,
  });
  if (error) throw error;
}

export async function upsertContactTeamOverride(input: UpsertContactTeamOverrideInput) {
  let matchQuery = supabase
    .from("contact_team_overrides")
    .select("id")
    .eq("contact_id", input.contact_id)
    .eq("department", input.department)
    .limit(1);

  matchQuery = applyNullableFilter(matchQuery, "service_type", input.service_type);
  matchQuery = applyNullableFilter(matchQuery, "team_id", input.team_id);

  const { data: existing, error: matchError } = await matchQuery.maybeSingle();
  if (matchError) throw matchError;

  const row = {
    contact_id: input.contact_id,
    customer_id: input.customer_id,
    department: input.department,
    service_type: input.service_type ?? null,
    team_id: input.team_id ?? null,
    team_name: input.team_name ?? null,
    assignments: input.assignments,
    notes: input.notes ?? null,
    updated_by: input.updated_by ?? null,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("contact_team_overrides")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("contact_team_overrides").insert({
    ...row,
    created_by: input.updated_by ?? null,
  });
  if (error) throw error;
}
