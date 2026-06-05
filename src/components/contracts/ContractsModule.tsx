/**
 * ContractsModule
 *
 * List/detail router for Contracts. 1:1 structural copy of ProjectsModule.tsx —
 * same props, same department logic, same update pattern — adapted for contract domain.
 *
 * @see /docs/blueprints/CONTRACTS_MODULE_BLUEPRINT.md
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import type { QuotationNew } from "../../types/pricing";
import { useDataScope } from "../../hooks/useDataScope";
import { useUrlSelection } from "../../hooks/useUrlSelection";
import { ContractsList } from "./ContractsList";
import { ContractDetailView } from "../pricing/ContractDetailView";
import { QuotationBuilderV3 } from "../pricing/quotations/QuotationBuilderV3";
import { useRealtimeSync } from "../../hooks/useRealtimeSync";

export type ContractsView = "list" | "detail" | "edit";

interface ContractsModuleProps {
  currentUser?: { 
    id?: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  onCreateTicket?: (entity: { type: string; id: string; name: string }) => void;
  initialContract?: QuotationNew | null;
  departmentOverride?: "BD" | "Operations" | "Accounting";
}

export function ContractsModule({ currentUser, onCreateTicket, initialContract, departmentOverride }: ContractsModuleProps) {
  const [view, setView] = useState<ContractsView>(initialContract ? "detail" : "list");
  const [selectedContract, setSelectedContract] = useState<QuotationNew | null>(initialContract || null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [urlContractId, setUrlContractId] = useUrlSelection("contract");
  const [initialTab, setInitialTab] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // Update view if initialContract changes
  useEffect(() => {
    if (initialContract) {
      setSelectedContract(initialContract);
      setView("detail");
    }
  }, [initialContract]);

  const { scope, isLoaded: scopeLoaded } = useDataScope('quotations');

  // ── Contracts fetch ───────────────────────────────────────
  const {
    data: contracts = [],
    isLoading,
    refetch,
  } = useQuery<QuotationNew[]>({
    queryKey: queryKeys.contracts.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .eq('quotation_type', 'contract')
        .or(
          'contract_status.in.(Active,Expiring,Expired,Renewed),' +
          'status.in.(Converted to Contract,Active Contract)'
        )
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      console.log(`ContractsModule: ${(data ?? []).length} activated contracts found`);
      // Mirror the hydration done by Pricing/BD loaders so downstream components
      // (ContractsList, QuotationBuilderV3 in edit mode) can rely on the canonical
      // `contract_validity_*` fields rather than the raw DB columns.
      return (data ?? []).map((row: any) => {
        const m: any = { ...(row?.details ?? {}), ...(row?.pricing ?? {}), ...row };
        if (!m.contract_validity_start && m.contract_start_date) m.contract_validity_start = m.contract_start_date;
        if (!m.contract_validity_end && m.contract_end_date) m.contract_validity_end = m.contract_end_date;
        return m;
      });
    },
    // Inherits 5-minute staleTime from global QueryClient config
  });
  const refreshContracts = () => { refetch(); };

  useRealtimeSync({ table: "quotations", queryKey: queryKeys.contracts.all() });

  // Customer ownership map — drives the customer-scope arm of the contract
  // visibility rule (a contract is visible when its customer is in scope, even
  // if the contract was created by someone outside the viewer's department).
  const customerIdsThisQuery = useMemo(
    () => Array.from(new Set(contracts.map(c => c.customer_id).filter(Boolean) as string[])),
    [contracts],
  );
  const { data: customerOwnerById = {} } = useQuery<Record<string, string | null>>({
    queryKey: ['customers', 'owner-map', customerIdsThisQuery.sort().join(',')],
    enabled: customerIdsThisQuery.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, owner_id')
        .in('id', customerIdsThisQuery);
      if (error) throw error;
      const map: Record<string, string | null> = {};
      for (const row of (data ?? []) as Array<{ id: string; owner_id: string | null }>) {
        map[row.id] = row.owner_id;
      }
      return map;
    },
  });

  // Apply scope filter client-side (cache doesn't support per-user keys).
  // A contract is visible when EITHER:
  //   - its creator is in scope (created_by), or
  //   - its customer's owner is in scope (customer.owner_id)
  // The customer-arm matters when contracts are created by someone outside the
  // viewer's department (e.g. a Pricing manager or an Executive) for a customer
  // that belongs to the viewer's department.
  const scopedContracts = useMemo(() => {
    if (!contracts || !scopeLoaded) return [];
    if (scope.type === 'all') return contracts;
    const allowedIds = scope.type === 'userIds' ? new Set(scope.ids) : new Set([scope.userId]);
    return contracts.filter(c => {
      const createdBy = (c as any).created_by as string | null | undefined;
      const customerOwner = c.customer_id ? customerOwnerById[c.customer_id] : null;
      return (
        (createdBy && allowedIds.has(createdBy)) ||
        (customerOwner && allowedIds.has(customerOwner))
      );
    });
  }, [contracts, scope, scopeLoaded, customerOwnerById]);

  // Restore-on-mount: if ?contract=<id> is in the URL, resolve the contract
  // from the cached list or fetch it directly from the DB.
  useEffect(() => {
    if (!urlContractId || restoredRef.current) return;
    if (isLoading) return; // wait for list query to settle

    // Read optional deep-link params (e.g. from inbox navigation)
    const targetTab = searchParams.get("tab");
    const targetHighlight = searchParams.get("highlight");

    // Try to find in the already-fetched list first
    const match = contracts.find(
      (c) => c.quote_number === urlContractId || c.id === urlContractId
    );

    if (match) {
      restoredRef.current = true;
      setSelectedContract(match);
      setInitialTab(targetTab || null);
      setHighlightId(targetHighlight || null);
      setView("detail");
      // Clean ancillary params (tab/highlight) but keep ?contract= for persistence
      if (targetTab || targetHighlight) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("tab");
          next.delete("highlight");
          return next;
        }, { replace: true });
      }
      return;
    }

    // Contract not in cached list (might be filtered out by scope or not yet
    // in the active-status filter). Fetch directly from DB.
    restoredRef.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", urlContractId)
        .eq("quotation_type", "contract")
        .single();
      if (error || !data) {
        console.warn("ContractsModule: URL contract not found, clearing param", urlContractId);
        setUrlContractId(null);
        return;
      }
      const row: any = data;
      const m: any = { ...(row?.details ?? {}), ...(row?.pricing ?? {}), ...row };
      if (!m.contract_validity_start && m.contract_start_date) m.contract_validity_start = m.contract_start_date;
      if (!m.contract_validity_end && m.contract_end_date) m.contract_validity_end = m.contract_end_date;
      setSelectedContract(m);
      setInitialTab(targetTab || null);
      setHighlightId(targetHighlight || null);
      setView("detail");
      // Clean ancillary params
      if (targetTab || targetHighlight) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("tab");
          next.delete("highlight");
          return next;
        }, { replace: true });
      }
    })();
  }, [urlContractId, contracts, isLoading, searchParams, setSearchParams, setUrlContractId]);

  const handleSelectContract = (contract: QuotationNew) => {
    setSelectedContract(contract);
    setView("detail");
    setUrlContractId(contract.id);
    restoredRef.current = true; // prevent restore effect from re-triggering
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedContract(null);
    setInitialTab(null);
    setHighlightId(null);
    setUrlContractId(null);
    restoredRef.current = false; // allow future URL restore
  };

  const handleContractUpdated = async (updatedContract?: QuotationNew) => {
    console.log('handleContractUpdated called — refreshing contract data...');
    
    // If viewing a specific contract, fetch fresh detail
    if (selectedContract) {
      try {
        const { data, error } = await supabase.from('quotations').select('*').eq('id', selectedContract.id).single();
        if (!error && data) {
          const row: any = data;
          const m: any = { ...(row?.details ?? {}), ...(row?.pricing ?? {}), ...row };
          if (!m.contract_validity_start && m.contract_start_date) m.contract_validity_start = m.contract_start_date;
          if (!m.contract_validity_end && m.contract_end_date) m.contract_validity_end = m.contract_end_date;
          setSelectedContract(m);
        } else {
          console.error('Failed to fetch contract:', error?.message);
        }
      } catch (error) {
        console.error('Error refreshing selected contract:', error);
      }
    }

    // If caller passed an updated contract directly, use it
    if (updatedContract) {
      setSelectedContract(updatedContract);
    }

    // Invalidate the contracts list cache so it's fresh when user navigates back to list
    queryClient.invalidateQueries({ queryKey: queryKeys.contracts.list() });
  };

  const handleEditContract = () => {
    if (selectedContract) {
      setView("edit");
    }
  };

  const handleSaveEditedContract = async (data: QuotationNew) => {
    try {
      const d = data as any;
      const TOP_LEVEL_COLUMNS = new Set([
        'addressed_to_name', 'addressed_to_title',
        'approved_by', 'approved_by_title',
        'assigned_to', 'auto_renew',
        'consignee_id', 'contact_id', 'contact_name', 'contact_person_id',
        'contract_end_date', 'contract_notes', 'contract_start_date', 'contract_status',
        'converted_at',
        'created_at', 'created_by', 'created_by_name',
        'currency', 'custom_notes',
        'customer_id', 'customer_name',
        'details',
        'expiry_date',
        'id', 'internal_notes', 'notes',
        'parent_contract_id', 'payment_terms',
        'prepared_by', 'prepared_by_title',
        'pricing', 'project_id',
        'quotation_date', 'quotation_name', 'quotation_number', 'quotation_type',
        'quote_number',
        'renewal_terms', 'services', 'services_metadata', 'status',
        'submitted_at', 'tags', 'total_buying', 'total_selling',
        'updated_at', 'validity_date', 'vendors',
      ]);
      const dateColumns = ['quotation_date', 'expiry_date', 'validity_date'];
      const top: Record<string, unknown> = {};
      const details: Record<string, unknown> = { ...(selectedContract as any).details };
      Object.entries(d).forEach(([key, value]) => {
        if (key === 'id' || key === 'project_id' || key === 'project_number') return;
        if (dateColumns.includes(key) && (!value || value === '')) return;
        if (key === 'contract_validity_start') { top.contract_start_date = value || null; return; }
        if (key === 'contract_validity_end') { top.contract_end_date = value || null; return; }
        if (key === 'valid_until') { top.expiry_date = value || null; return; }
        if (TOP_LEVEL_COLUMNS.has(key)) {
          top[key] = value;
        } else {
          details[key] = value;
        }
      });
      top.details = details;
      top.updated_at = new Date().toISOString();
      const { error } = await supabase.from('quotations').update(top).eq('id', selectedContract!.id);
      if (error) throw error;

      // Detect rate card changes and create a new version
      const { rateMatricesChanged, createRateVersion } = await import("../../utils/contractVersioning");
      const oldRateMatrices = (selectedContract as any).rate_matrices ?? (selectedContract as any).details?.rate_matrices;
      const newRateMatrices = d.rate_matrices ?? details.rate_matrices;
      if (rateMatricesChanged(oldRateMatrices, newRateMatrices) && newRateMatrices) {
        const userId = currentUser?.id ?? null;
        const userName = currentUser?.name ?? null;
        const version = await createRateVersion(
          selectedContract!.id,
          newRateMatrices as any,
          userId ?? null,
          userName,
          "Rate card updated"
        );
        if (version) {
          toast.success(`Contract updated — rate card v${version.version_number} created`);
        } else {
          toast.success("Contract updated successfully");
        }
      } else {
        toast.success("Contract updated successfully");
      }

      // Refresh and go back to detail view
      await handleContractUpdated();
      setView("detail");
    } catch (err: any) {
      console.error("Error saving edited contract:", err);
      toast.error(err?.message || "Failed to save contract");
    }
  };

  // Use the current user's department to determine which view to show
  // Same logic as ProjectsModule
  
  // Logic: 
  // 1. If override provided, use it.
  // 2. If user is BD/Pricing -> BD
  // 3. Else -> Operations
  
  let department: "BD" | "Operations" | "Accounting" = "Operations";
  
  if (departmentOverride) {
    department = departmentOverride;
  } else if (
    currentUser?.department === "BD" || 
    currentUser?.department === "Business Development" ||
    currentUser?.department === "Pricing"
  ) {
    department = "BD";
  }
  
  console.log("ContractsModule - Department:", department, "- User:", currentUser?.department);

  return (
    <div className="h-full bg-[var(--theme-bg-surface)]">
      {view === "list" && (
        <ContractsList
          contracts={scopedContracts}
          onSelectContract={handleSelectContract}
          isLoading={isLoading}
          currentUser={currentUser}
          department={department}
          onRefresh={refreshContracts}
        />
      )}

      {view === "detail" && selectedContract && (
        <ContractDetailView
          quotation={selectedContract}
          onBack={handleBackToList}
          onEdit={handleEditContract}
          onUpdate={handleContractUpdated}
          currentUser={currentUser}
          initialTab={initialTab}
          highlightId={highlightId}
          contractDept={department === "Accounting" ? "accounting" : "pricing"}
        />
      )}

      {view === "edit" && selectedContract && (
        <QuotationBuilderV3
          onClose={() => setView("detail")}
          onSave={handleSaveEditedContract}
          initialData={selectedContract}
          mode="edit"
          builderMode="quotation"
          initialQuotationType="contract"
        />
      )}
    </div>
  );
}
