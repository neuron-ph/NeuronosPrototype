import { useState, useEffect, useCallback, useRef } from "react";
import { NetworkPartner, NETWORK_PARTNERS } from "../data/networkPartners";
import { supabase } from "../utils/supabase/client";

// Map NetworkPartner interface fields → service_providers DB column names
function toDbRow(p: Partial<NetworkPartner>): Record<string, unknown> {
  return {
    id: p.id,
    company_name: p.company_name,
    provider_type: p.partner_type ?? 'international', // DB: provider_type (NOT NULL)
    country: p.country,
    territory: p.territory,
    wca_number: p.wca_id,                            // DB: wca_number
    contact_person: p.contact_person,
    contact_phone: p.mobile ?? p.phone,              // DB: contact_phone
    address: p.address,
    emails: p.emails,
    services: p.services,
    charge_categories: p.charge_categories,
    line_items: p.line_items,
    notes: p.notes,
  };
}

// Map service_providers DB row → NetworkPartner interface fields
function fromDbRow(row: Record<string, unknown>): NetworkPartner {
  return {
    id: row.id as string,
    company_name: (row.company_name as string) ?? '',
    wca_id: (row.wca_number as string) ?? '',        // DB: wca_number
    expires: '',                                      // Not stored in DB
    contact_person: (row.contact_person as string) ?? '',
    emails: (row.emails as string[]) ?? [],
    country: (row.country as string) ?? '',
    territory: row.territory as string | undefined,
    is_wca_conference: false,                         // Not stored in DB
    services: (row.services as string[]) ?? [],
    notes: row.notes as string | undefined,
    partner_type: (row.provider_type as NetworkPartner['partner_type']) ?? 'international',
    phone: row.contact_phone as string | undefined,
    mobile: row.contact_phone as string | undefined, // DB: contact_phone
    address: row.address as string | undefined,
    charge_categories: row.charge_categories as NetworkPartner['charge_categories'],
    line_items: row.line_items as NetworkPartner['line_items'],
  };
}

export function useNetworkPartners() {
  const [partners, setPartners] = useState<NetworkPartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seedingAttempted = useRef(false);

  const seedPartners = async (seedData: NetworkPartner[]) => {
    if (seedingAttempted.current) return false;
    seedingAttempted.current = true;

    try {
      console.log(`Starting seed with ${seedData.length} partners...`);

      const { error: insertErr } = await supabase
        .from('service_providers')
        .upsert(seedData.map(toDbRow), { onConflict: 'id' });
      
      if (insertErr) {
        console.error("Seeding failed:", insertErr.message);
        return false;
      }
      
      console.log(`Seeding complete. Successfully seeded ${seedData.length} partners.`);
      return true;
    } catch (err) {
      console.error("Seeding process error:", err);
      return false;
    }
  };

  const fetchPartners = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error: fetchErr } = await supabase
        .from('service_providers')
        .select('*');

      if (fetchErr) {
        throw new Error(fetchErr.message);
      }

      const rows = data || [];

      // Auto-seeding logic
      if (rows.length === 0 && NETWORK_PARTNERS && NETWORK_PARTNERS.length > 0) {
        console.log("Empty backend detected. Initiating seeding...");

        // Show local data immediately for better UX
        setPartners(NETWORK_PARTNERS);

        // Seed in background
        seedPartners(NETWORK_PARTNERS).then((seeded) => {
          if (seeded) {
            console.log("Seeding finished successfully. Data synced.");
          } else {
            console.warn("Seeding finished with errors or was skipped.");
          }
        });

      } else {
        setPartners(rows.map(fromDbRow));
      }
    } catch (err) {
      console.error("Error in useNetworkPartners:", err);
      setError(String(err));
      // Fallback to local data on error to keep app usable
      if (NETWORK_PARTNERS) {
        console.log("Falling back to local data due to error.");
        setPartners(NETWORK_PARTNERS);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const savePartner = async (partnerData: Partial<NetworkPartner>) => {
    try {
      const isNew = !partnerData.id || partnerData.id.startsWith("new-");
      
      // Optimistic update
      const tempId = partnerData.id || `temp-${Date.now()}`;
      const optimisticPartner = { ...partnerData, id: tempId } as NetworkPartner;
      
      setPartners(prev => {
        if (isNew) return [...prev, optimisticPartner];
        return prev.map(p => p.id === partnerData.id ? { ...p, ...partnerData } : p);
      });

      if (isNew) {
        const newPartner = toDbRow({ ...partnerData, id: `sp-${Date.now()}` });
        const { data: created, error: insertErr } = await supabase
          .from('service_providers')
          .insert(newPartner)
          .select()
          .single();

        if (insertErr) throw new Error(insertErr.message);

        const mapped = fromDbRow(created as Record<string, unknown>);
        setPartners(prev => prev.map(p => p.id === tempId ? mapped : p));
        return mapped;
      } else {
        const { data: updated, error: updateErr } = await supabase
          .from('service_providers')
          .update(toDbRow(partnerData))
          .eq('id', partnerData.id!)
          .select()
          .single();

        if (updateErr) throw new Error(updateErr.message);

        const mapped = fromDbRow(updated as Record<string, unknown>);
        setPartners(prev => prev.map(p => p.id === mapped.id ? mapped : p));
        return mapped;
      }
    } catch (err) {
      console.error("Error saving partner:", err);
      throw err;
    }
  };

  const deletePartner = async (id: string) => {
    try {
      // Optimistic update
      setPartners(prev => prev.filter(p => p.id !== id));

      const { error: deleteErr } = await supabase
        .from('service_providers')
        .delete()
        .eq('id', id);

      if (deleteErr) {
        throw new Error(deleteErr.message);
      }
    } catch (err) {
      console.error("Error deleting partner:", err);
      fetchPartners(); // Revert on error
      throw err;
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  return {
    partners,
    isLoading,
    error,
    refetch: fetchPartners,
    savePartner,
    deletePartner
  };
}