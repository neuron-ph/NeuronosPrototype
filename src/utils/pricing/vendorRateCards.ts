import type { QuotationChargeCategory } from "../../types/pricing";
import { supabase } from "../supabase/client";

type RateCardClient = {
  from: (table: string) => any;
};

interface SaveVendorChargeCategoriesInput {
  vendorId: string;
  vendorName?: string;
  vendorType?: string;
  categories: QuotationChargeCategory[];
}

function toProviderType(vendorType?: string): string {
  const normalized = (vendorType || "international").toLowerCase();

  if (normalized.includes("co-loader")) return "co-loader";
  if (normalized.includes("all-in")) return "all-in";
  if (normalized.includes("subcontractor")) return "subcontractor";
  if (normalized.includes("local")) return "local_agent";

  return "international";
}

export async function fetchVendorChargeCategories(
  client: RateCardClient = supabase,
  vendorId: string,
): Promise<QuotationChargeCategory[]> {
  const { data, error } = await client
    .from("service_providers")
    .select("charge_categories")
    .eq("id", vendorId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data?.charge_categories || []) as QuotationChargeCategory[];
}

export async function saveVendorChargeCategories(
  client: RateCardClient = supabase,
  input: SaveVendorChargeCategoriesInput,
): Promise<void> {
  const { error } = await client
    .from("service_providers")
    .upsert(
      {
        id: input.vendorId,
        company_name: input.vendorName || input.vendorId,
        provider_type: toProviderType(input.vendorType),
        charge_categories: input.categories,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
}
