import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";

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

const FALLBACK: CompanySettings = {
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

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (!cancelled) {
        if (data && !error) {
          setSettings(data as CompanySettings);
        }
        setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, []);

  return { settings, loading };
}
