import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import {
  upsertContactTeamOverride as persistContactTeamOverride,
  upsertCustomerTeamProfile as persistCustomerTeamProfile,
} from "../utils/teamProfilePersistence";
import type {
  CustomerTeamProfile,
  ContactTeamOverride,
  ResolvedTeamProfile,
  TeamProfileAssignment,
  UpsertCustomerTeamProfileInput,
  UpsertContactTeamOverrideInput,
} from "../types/bd";

// ─── Customer team profiles ──────────────────────────────────────────────────

export function useCustomerTeamProfiles(customerId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.teamProfiles.forCustomer(customerId ?? ""),
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_team_profiles")
        .select("*")
        .eq("customer_id", customerId!)
        .order("department")
        .order("service_type", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as CustomerTeamProfile[];
    },
  });

  const upsertProfile = async (input: UpsertCustomerTeamProfileInput) => {
    await persistCustomerTeamProfile(input);
    await qc.invalidateQueries({ queryKey: queryKeys.teamProfiles.forCustomer(input.customer_id) });
    await qc.invalidateQueries({ queryKey: queryKeys.teamProfiles.all() });
  };

  const deleteProfile = async (profileId: string) => {
    const { error } = await supabase
      .from("customer_team_profiles")
      .delete()
      .eq("id", profileId);
    if (error) throw error;
    if (customerId) {
      await qc.invalidateQueries({ queryKey: queryKeys.teamProfiles.forCustomer(customerId) });
    }
    await qc.invalidateQueries({ queryKey: queryKeys.teamProfiles.all() });
  };

  return { profiles: query.data ?? [], isLoading: query.isLoading, upsertProfile, deleteProfile };
}

// ─── Contact team overrides ──────────────────────────────────────────────────

export function useContactTeamProfiles(params: {
  contactId: string | undefined;
  customerId: string | undefined;
}) {
  const { contactId, customerId } = params;
  const qc = useQueryClient();

  const customerQuery = useQuery({
    queryKey: queryKeys.teamProfiles.forCustomer(customerId ?? ""),
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_team_profiles")
        .select("*")
        .eq("customer_id", customerId!)
        .order("department")
        .order("service_type", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as CustomerTeamProfile[];
    },
  });

  const overrideQuery = useQuery({
    queryKey: queryKeys.teamProfiles.forContact(contactId ?? ""),
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_team_overrides")
        .select("*")
        .eq("contact_id", contactId!)
        .order("department")
        .order("service_type", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as ContactTeamOverride[];
    },
  });

  // Build merged view: for each customer profile, check if an override exists
  const resolvedProfiles: ResolvedTeamProfile[] = (customerQuery.data ?? []).map((cp) => {
    const override = (overrideQuery.data ?? []).find(
      (o) =>
        o.department === cp.department &&
        (o.service_type ?? null) === (cp.service_type ?? null) &&
        (o.team_id ?? null) === (cp.team_id ?? null)
    );
    if (override && override.assignments.length > 0) {
      return {
        department: cp.department,
        service_type: cp.service_type,
        team_id: cp.team_id,
        team_name: cp.team_name,
        assignments: override.assignments,
        source: "contact_override",
      };
    }
    return {
      department: cp.department,
      service_type: cp.service_type,
      team_id: cp.team_id,
      team_name: cp.team_name,
      assignments: cp.assignments,
      source: "customer",
    };
  });

  // Also surface contact-only overrides (dept not in customer profiles)
  for (const o of overrideQuery.data ?? []) {
    const alreadyCovered = (customerQuery.data ?? []).some(
      (cp) =>
        cp.department === o.department &&
        (cp.service_type ?? null) === (o.service_type ?? null) &&
        (cp.team_id ?? null) === (o.team_id ?? null)
    );
    if (!alreadyCovered && o.assignments.length > 0) {
      resolvedProfiles.push({
        department: o.department,
        service_type: o.service_type,
        team_id: o.team_id,
        team_name: o.team_name,
        assignments: o.assignments,
        source: "contact_override",
      });
    }
  }

  const upsertOverride = async (input: UpsertContactTeamOverrideInput) => {
    await persistContactTeamOverride(input);
    if (contactId) {
      await qc.invalidateQueries({ queryKey: queryKeys.teamProfiles.forContact(contactId) });
    }
  };

  const clearOverride = async (overrideId: string) => {
    const { error } = await supabase
      .from("contact_team_overrides")
      .delete()
      .eq("id", overrideId);
    if (error) throw error;
    if (contactId) {
      await qc.invalidateQueries({ queryKey: queryKeys.teamProfiles.forContact(contactId) });
    }
  };

  return {
    customerProfiles: customerQuery.data ?? [],
    overrides: overrideQuery.data ?? [],
    resolvedProfiles,
    isLoading: customerQuery.isLoading || overrideQuery.isLoading,
    upsertOverride,
    clearOverride,
  };
}

// ─── Resolved profile for creation form auto-fill ────────────────────────────

export function useResolvedTeamProfile(params: {
  customerId: string | undefined;
  contactId?: string | null;
  department: string;
  serviceType?: string | null;
}) {
  const { customerId, contactId, department, serviceType } = params;

  const customerQuery = useQuery({
    queryKey: queryKeys.teamProfiles.forCustomer(customerId ?? ""),
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_team_profiles")
        .select("*")
        .eq("customer_id", customerId!);
      if (error) throw error;
      return (data ?? []) as CustomerTeamProfile[];
    },
  });

  const overrideQuery = useQuery({
    queryKey: queryKeys.teamProfiles.forContact(contactId ?? ""),
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_team_overrides")
        .select("*")
        .eq("contact_id", contactId!);
      if (error) throw error;
      return (data ?? []) as ContactTeamOverride[];
    },
  });

  // Resolution order: contact override → customer profile (exact match on dept + service_type)
  const resolve = (): ResolvedTeamProfile | null => {
    const matchesScope = (row: { department: string; service_type?: string | null }) =>
      row.department === department &&
      (row.service_type ?? null) === (serviceType ?? null);

    if (contactId) {
      const override = (overrideQuery.data ?? []).find(matchesScope);
      if (override && override.assignments.length > 0) {
        return {
          department,
          service_type: serviceType,
          team_id: override.team_id,
          team_name: override.team_name,
          assignments: override.assignments,
          source: "contact_override",
        };
      }
    }

    const cp = (customerQuery.data ?? []).find(matchesScope);
    if (cp && cp.assignments.length > 0) {
      return {
        department,
        service_type: serviceType,
        team_id: cp.team_id,
        team_name: cp.team_name,
        assignments: cp.assignments,
        source: "customer",
      };
    }

    return null;
  };

  const profile = resolve();

  return {
    profile,
    assignments: profile?.assignments ?? [] as TeamProfileAssignment[],
    source: profile?.source ?? "none" as ResolvedTeamProfile["source"] | "none",
    isLoading: customerQuery.isLoading || (!!contactId && overrideQuery.isLoading),
  };
}
