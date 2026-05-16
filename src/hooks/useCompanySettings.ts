import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";

export interface CompanySettings {
  id: string;
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  country: string | null;
  phone_numbers: string[];
  email: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  logo_url: string | null;
  updated_at: string;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  id: "default",
  company_name: "Neuron Logistics Inc.",
  address_line1: "Unit 301, Great Wall Bldg., 136 Yakal St.",
  address_line2: "San Antonio Village",
  city: "Makati City",
  country: "Philippines",
  phone_numbers: ["+63 (2) 5310 4083", "+63 (2) 7004 7583", "+63 935 981 6652"],
  email: "inquiries@neuron-os.com",
  bank_name: "BDO Unibank",
  bank_account_name: "Neuron Logistics Inc.",
  bank_account_number: "0012-3456-7890",
  logo_url: null,
  updated_at: new Date().toISOString(),
};

function textOrDefault(value: string | null | undefined, fallback: string | null): string | null {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizePhoneNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_COMPANY_SETTINGS.phone_numbers;
  const cleaned = value
    .filter((phone): phone is string => typeof phone === "string")
    .map((phone) => phone.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : DEFAULT_COMPANY_SETTINGS.phone_numbers;
}

export function normalizeCompanySettings(settings?: Partial<CompanySettings> | null): CompanySettings {
  if (!settings) return DEFAULT_COMPANY_SETTINGS;

  return {
    id: textOrDefault(settings.id, DEFAULT_COMPANY_SETTINGS.id) || DEFAULT_COMPANY_SETTINGS.id,
    company_name:
      textOrDefault(settings.company_name, DEFAULT_COMPANY_SETTINGS.company_name) ||
      DEFAULT_COMPANY_SETTINGS.company_name,
    address_line1: textOrDefault(settings.address_line1, DEFAULT_COMPANY_SETTINGS.address_line1),
    address_line2: textOrDefault(settings.address_line2, DEFAULT_COMPANY_SETTINGS.address_line2),
    city: textOrDefault(settings.city, DEFAULT_COMPANY_SETTINGS.city),
    country: textOrDefault(settings.country, DEFAULT_COMPANY_SETTINGS.country),
    phone_numbers: normalizePhoneNumbers(settings.phone_numbers),
    email: textOrDefault(settings.email, DEFAULT_COMPANY_SETTINGS.email),
    bank_name: textOrDefault(settings.bank_name, DEFAULT_COMPANY_SETTINGS.bank_name),
    bank_account_name: textOrDefault(settings.bank_account_name, DEFAULT_COMPANY_SETTINGS.bank_account_name),
    bank_account_number: textOrDefault(settings.bank_account_number, DEFAULT_COMPANY_SETTINGS.bank_account_number),
    logo_url: textOrDefault(settings.logo_url, DEFAULT_COMPANY_SETTINGS.logo_url),
    updated_at: textOrDefault(settings.updated_at, DEFAULT_COMPANY_SETTINGS.updated_at) || DEFAULT_COMPANY_SETTINGS.updated_at,
  };
}

export function useCompanySettings() {
  const { data: settings = DEFAULT_COMPANY_SETTINGS, isLoading: loading } = useQuery<CompanySettings>({
    queryKey: queryKeys.companySettings.default(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (error || !data) return DEFAULT_COMPANY_SETTINGS;
      return normalizeCompanySettings(data as Partial<CompanySettings>);
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_COMPANY_SETTINGS,
  });

  return { settings, loading };
}

export type CompanySettingsPatch = Partial<
  Pick<
    CompanySettings,
    | "company_name"
    | "address_line1"
    | "address_line2"
    | "city"
    | "country"
    | "phone_numbers"
    | "email"
    | "bank_name"
    | "bank_account_name"
    | "bank_account_number"
    | "logo_url"
  >
>;

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: CompanySettingsPatch) => {
      const { data, error } = await supabase
        .from("company_settings")
        .upsert({ id: "default", ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return normalizeCompanySettings(data as Partial<CompanySettings>);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.companySettings.default(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.companySettings.all() });
    },
  });
}
