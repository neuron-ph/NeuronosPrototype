import { useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NetworkPartner, NETWORK_PARTNERS } from "../data/networkPartners";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import { usePermission } from "../context/PermissionProvider";

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
  const queryClient = useQueryClient();
  const { can } = usePermission(); // NEU-019 WG-12
  const seedingAttempted = useRef(false);

  const { data: partners = [], isLoading, error: queryError } = useQuery({
    queryKey: queryKeys.networkPartners.list(),
    queryFn: async (): Promise<NetworkPartner[]> => {
      const { data, error: fetchErr } = await supabase
        .from('service_providers')
        .select('*');

      if (fetchErr) throw new Error(fetchErr.message);

      const rows = data || [];

      if (rows.length === 0 && NETWORK_PARTNERS && NETWORK_PARTNERS.length > 0) {
        if (!seedingAttempted.current) {
          seedingAttempted.current = true;
          supabase
            .from('service_providers')
            .upsert(NETWORK_PARTNERS.map(toDbRow), { onConflict: 'id' })
            .then(({ error: insertErr }) => {
              if (insertErr) {
                console.error("Seeding failed:", insertErr.message);
              } else {
                console.log(`Seeding complete. Successfully seeded ${NETWORK_PARTNERS.length} partners.`);
                queryClient.invalidateQueries({ queryKey: queryKeys.networkPartners.all() });
              }
            });
        }
        return NETWORK_PARTNERS;
      }

      return rows.map(fromDbRow);
    },
    staleTime: 5 * 60 * 1000,
    // On error, fall back to local data so the app stays usable
    placeholderData: NETWORK_PARTNERS,
  });

  const error = queryError ? String(queryError) : null;

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.networkPartners.all() });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async (partnerData: Partial<NetworkPartner>): Promise<NetworkPartner> => {
      const isNew = !partnerData.id || partnerData.id.startsWith("new-");
      // NEU-019 WG-12: vendor master data writes need the partners knob
      if (!can("pricing_network_partners", isNew ? "create" : "edit")) {
        throw new Error("You don't have permission to save vendors.");
      }

      if (isNew) {
        const newRow = toDbRow({ ...partnerData, id: `sp-${Date.now()}` });
        const { data: created, error: insertErr } = await supabase
          .from('service_providers')
          .insert(newRow)
          .select()
          .single();

        if (insertErr) throw new Error(insertErr.message);
        return fromDbRow(created as Record<string, unknown>);
      } else {
        const { data: updated, error: updateErr } = await supabase
          .from('service_providers')
          .update(toDbRow(partnerData))
          .eq('id', partnerData.id!)
          .select()
          .single();

        if (updateErr) throw new Error(updateErr.message);
        return fromDbRow(updated as Record<string, unknown>);
      }
    },
    onMutate: async (partnerData) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.networkPartners.list() });
      const previous = queryClient.getQueryData<NetworkPartner[]>(queryKeys.networkPartners.list());
      const isNew = !partnerData.id || partnerData.id.startsWith("new-");
      const tempId = partnerData.id || `temp-${Date.now()}`;
      const optimistic = { ...partnerData, id: tempId } as NetworkPartner;

      queryClient.setQueryData<NetworkPartner[]>(queryKeys.networkPartners.list(), (prev = []) => {
        if (isNew) return [...prev, optimistic];
        return prev.map(p => p.id === partnerData.id ? { ...p, ...partnerData } : p);
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.networkPartners.list(), context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.networkPartners.all() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!can("pricing_network_partners", "delete")) {
        throw new Error("You don't have permission to delete vendors."); // WG-12
      }
      const { error: deleteErr } = await supabase
        .from('service_providers')
        .delete()
        .eq('id', id);

      if (deleteErr) throw new Error(deleteErr.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.networkPartners.list() });
      const previous = queryClient.getQueryData<NetworkPartner[]>(queryKeys.networkPartners.list());

      queryClient.setQueryData<NetworkPartner[]>(queryKeys.networkPartners.list(), (prev = []) =>
        prev.filter(p => p.id !== id)
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.networkPartners.list(), context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.networkPartners.all() });
    },
  });

  const savePartner = useCallback(
    (partnerData: Partial<NetworkPartner>) => saveMutation.mutateAsync(partnerData),
    [saveMutation]
  );

  const deletePartner = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation]
  );

  return {
    partners,
    isLoading,
    error,
    refetch,
    savePartner,
    deletePartner,
  };
}
