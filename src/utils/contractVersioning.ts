import { supabase } from "./supabase/client";
import type { ContractRateMatrix } from "../types/pricing";

export interface ContractRateVersion {
  id: string;
  contract_id: string;
  version_number: number;
  rate_matrices: ContractRateMatrix[];
  effective_from: string;
  effective_until: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export async function getNextVersionNumber(contractId: string): Promise<number> {
  const { data } = await supabase
    .from("contract_rate_versions")
    .select("version_number")
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version_number ?? 0) + 1;
}

export async function createRateVersion(
  contractId: string,
  rateMatrices: ContractRateMatrix[],
  userId: string | null,
  userName: string | null,
  changeSummary?: string
): Promise<ContractRateVersion | null> {
  const now = new Date().toISOString();

  // Close the current version
  await supabase
    .from("contract_rate_versions")
    .update({ effective_until: now })
    .eq("contract_id", contractId)
    .is("effective_until", null);

  const nextVersion = await getNextVersionNumber(contractId);

  const { data, error } = await supabase
    .from("contract_rate_versions")
    .insert({
      contract_id: contractId,
      version_number: nextVersion,
      rate_matrices: rateMatrices,
      effective_from: now,
      effective_until: null,
      change_summary: changeSummary || null,
      created_by: userId,
      created_by_name: userName,
    })
    .select()
    .single();

  if (error) {
    console.error("[contractVersioning] Failed to create version:", error);
    return null;
  }

  // Log activity
  await supabase.from("contract_activity").insert({
    contract_id: contractId,
    event_type: "rates_updated",
    description: changeSummary || `Rate card updated to v${nextVersion}`,
    user_id: userId,
    user_name: userName,
    metadata: { version_number: nextVersion },
  });

  return data as ContractRateVersion;
}

export async function getCurrentVersion(contractId: string): Promise<ContractRateVersion | null> {
  const { data, error } = await supabase
    .from("contract_rate_versions")
    .select("*")
    .eq("contract_id", contractId)
    .is("effective_until", null)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[contractVersioning] Failed to get current version:", error);
    return null;
  }
  return data as ContractRateVersion | null;
}

export async function getVersionById(rateVersionId: string): Promise<ContractRateVersion | null> {
  const { data, error } = await supabase
    .from("contract_rate_versions")
    .select("*")
    .eq("id", rateVersionId)
    .maybeSingle();

  if (error) {
    console.error("[contractVersioning] Failed to get version:", error);
    return null;
  }
  return data as ContractRateVersion | null;
}

export async function getVersionHistory(contractId: string): Promise<ContractRateVersion[]> {
  const { data, error } = await supabase
    .from("contract_rate_versions")
    .select("*")
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false });

  if (error) {
    console.error("[contractVersioning] Failed to get version history:", error);
    return [];
  }
  return (data ?? []) as ContractRateVersion[];
}

export function rateMatricesChanged(
  oldMatrices: ContractRateMatrix[] | undefined,
  newMatrices: ContractRateMatrix[] | undefined
): boolean {
  const a = JSON.stringify(oldMatrices ?? []);
  const b = JSON.stringify(newMatrices ?? []);
  return a !== b;
}
