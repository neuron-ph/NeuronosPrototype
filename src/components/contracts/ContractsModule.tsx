/**
 * ContractsModule
 *
 * List/detail router for Contracts. 1:1 structural copy of ProjectsModule.tsx —
 * same props, same department logic, same update pattern — adapted for contract domain.
 *
 * @see /docs/blueprints/CONTRACTS_MODULE_BLUEPRINT.md
 */

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import type { QuotationNew } from "../../types/pricing";
import { useDataScope } from "../../hooks/useDataScope";
import { ContractsList } from "./ContractsList";
import { ContractDetailView } from "../pricing/ContractDetailView";

export type ContractsView = "list" | "detail";

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
  const [initialTab, setInitialTab] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Update view if initialContract changes
  useEffect(() => {
    if (initialContract) {
      setSelectedContract(initialContract);
      setView("detail");
    }
  }, [initialContract]);

  const { scope, isLoaded: scopeLoaded } = useDataScope();

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

  // Apply scope filter client-side (cache doesn't support per-user keys)
  const scopedContracts = useMemo(() => {
    if (!contracts || !scopeLoaded) return [];
    if (scope.type === 'all') return contracts;
    if (scope.type === 'userIds') return contracts.filter(c => scope.ids.includes(c.prepared_by || ''));
    return contracts.filter(c => c.prepared_by === scope.userId);
  }, [contracts, scope, scopeLoaded]);

  // Deep-link: auto-select contract from ?contract= query param
  useEffect(() => {
    const contractId = searchParams.get("contract");
    const targetTab = searchParams.get("tab");
    const targetHighlight = searchParams.get("highlight");
    if (!contractId || contracts.length === 0 || isLoading) return;

    const match = contracts.find(
      (c) => c.quote_number === contractId || c.id === contractId
    );
    if (match) {
      setSelectedContract(match);
      setInitialTab(targetTab || null);
      setHighlightId(targetHighlight || null);
      setView("detail");
      // Clean the query param so back-navigation doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, contracts, isLoading, setSearchParams]);

  const handleSelectContract = (contract: QuotationNew) => {
    setSelectedContract(contract);
    setView("detail");
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedContract(null);
    setInitialTab(null);
    setHighlightId(null);
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
    // Placeholder — parent can wire this to open QuotationBuilderV3 in contract mode
    if (selectedContract) {
      console.log("Edit contract requested:", selectedContract.quote_number);
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
    </div>
  );
}
