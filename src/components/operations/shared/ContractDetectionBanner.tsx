/**
 * ContractDetectionBanner
 *
 * Detects active contracts for a given customer name and displays
 * a subtle teal-accented info banner in booking creation panels.
 * Auto-links the booking to the detected contract via onContractDetected callback.
 *
 * Refactored in Phase 1 of CONTRACT_FLOWCHART_INTEGRATION_BLUEPRINT to use
 * shared contractLookup utility (DRY: fetch logic extracted).
 *
 * @see /docs/blueprints/CONTRACT_FLOWCHART_INTEGRATION_BLUEPRINT.md - Phase 1, Task 1.3
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import type { ContractSummary } from "../../../types/pricing";
import {
  fetchActiveContractsForCustomer,
  filterContractsForService,
} from "../../../utils/contractLookup";

interface ContractDetectionBannerProps {
  /** Customer name to check against -- triggers detection when changed */
  customerName: string;
  /** Service type of the booking being created (e.g., "Brokerage", "Forwarding") */
  serviceType?: string;
  /** Callback when a contract is detected/cleared -- parent should store the contract_id */
  onContractDetected: (contractId: string | null) => void;
  /** Callback fired with the full contract summary so the parent can autofill display fields. */
  onContractInfo?: (contract: ContractSummary | null) => void;
  /** Callback fired with the full list of selectable contracts. When provided and >1 contract
   *  is found, the banner suppresses its built-in bullet picker so the parent can render its own. */
  onContractsList?: (contracts: ContractSummary[]) => void;
  /** Externally controlled selected contract id. When set, overrides the banner's internal selection. */
  selectedContractId?: string | null;
  /** When false, detection is disabled and no link is established. Defaults to true. */
  enabled?: boolean;
  /**
   * When true, render an inline warning if no active contract is found for the
   * customer (e.g. when "Standard" brokerage is selected but the customer has
   * no active brokerage contract).
   */
  requireContract?: boolean;
  /** Optional label for the missing-contract warning (defaults to serviceType). */
  requireContractLabel?: string;
  /** When true, only contracts covering serviceType are selectable. */
  strictServiceMatch?: boolean;
}

export function ContractDetectionBanner({
  customerName,
  serviceType,
  onContractDetected,
  onContractInfo,
  onContractsList,
  selectedContractId: externalSelectedId,
  enabled = true,
  requireContract = false,
  requireContractLabel,
  strictServiceMatch = false,
}: ContractDetectionBannerProps) {
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedName = useRef("");

  useEffect(() => {
    if (!enabled) {
      setContracts([]);
      setSelectedContractId(null);
      onContractDetected(null);
      onContractInfo?.(null);
      onContractsList?.([]);
      lastCheckedName.current = "";
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return;

    if (!customerName || customerName.trim().length < 3) {
      setContracts([]);
      setSelectedContractId(null);
      onContractDetected(null);
      onContractInfo?.(null);
      onContractsList?.([]);
      lastCheckedName.current = "";
      return;
    }

    const trimmed = customerName.trim();
    if (trimmed === lastCheckedName.current) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void checkForContracts(trimmed);
    }, 600);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [customerName, enabled, serviceType, strictServiceMatch]); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkForContracts(name: string) {
    setIsLoading(true);
    lastCheckedName.current = name;

    try {
      const found = await fetchActiveContractsForCustomer(name);
      const selectableContracts = strictServiceMatch
        ? filterContractsForService(found, serviceType)
        : found;

      setContracts(selectableContracts);
      onContractsList?.(selectableContracts);

      if (selectableContracts.length > 0) {
        const autoSelected = selectableContracts[0];
        setSelectedContractId(autoSelected.id);
        onContractDetected(autoSelected.id);
        onContractInfo?.(autoSelected);
      } else {
        setSelectedContractId(null);
        onContractDetected(null);
        onContractInfo?.(null);
      }
    } catch (err) {
      console.error("Contract detection error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  // Sync internal selection to externally-controlled id (parent takeover).
  useEffect(() => {
    if (externalSelectedId !== undefined && externalSelectedId !== null) {
      if (externalSelectedId !== selectedContractId) {
        setSelectedContractId(externalSelectedId);
      }
    }
  }, [externalSelectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null;

  if (!isLoading && contracts.length === 0) {
    if (requireContract && (customerName?.trim().length ?? 0) >= 3) {
      const label = requireContractLabel ?? serviceType ?? "this service";
      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
            marginTop: "6px",
            paddingLeft: "2px",
          }}
        >
          <AlertTriangle size={12} style={{ color: "#B45309", flexShrink: 0, marginTop: "2px" }} />
          <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", lineHeight: 1.4 }}>
            No active contract found for{" "}
            <span style={{ fontWeight: 600, color: "var(--theme-text-primary)" }}>{customerName}</span>
            {" "}covering {label}. Standard bookings normally link to a contract - confirm the
            customer has one or switch to All-Inclusive / Non-Regular.
          </span>
        </div>
      );
    }
    return null;
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "6px",
          paddingLeft: "2px",
        }}
      >
        <div
          style={{
            width: "12px",
            height: "12px",
            border: "1.5px solid var(--theme-border-default)",
            borderTopColor: "var(--theme-action-primary-bg)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
          Checking contracts...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const selected = contracts.find((contract) => contract.id === selectedContractId) || contracts[0];
  if (!selected) return null;

  // When parent is handling multi-contract selection (via onContractsList), don't render
  // our own bullet picker — just stay quiet so the parent's dropdown is the single source of truth.
  if (contracts.length > 1 && onContractsList) {
    return null;
  }

  if (contracts.length > 1) {
    return (
      <div style={{ marginTop: "6px", paddingLeft: "2px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <Link2 size={12} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
          <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
            Linked to{" "}
            <span style={{ fontWeight: 600, color: "var(--theme-text-primary)" }}>
              {selected.quote_number}
            </span>
            {selected.quotation_name && (
              <span style={{ color: "var(--theme-text-muted)" }}> - {selected.quotation_name}</span>
            )}
          </span>
          <span
            style={{
              fontSize: "10px",
              color: "var(--theme-text-muted)",
              marginLeft: "4px",
              cursor: "default",
            }}
          >
            ({contracts.length} contracts)
          </span>
        </div>
        <div style={{ marginTop: "4px", paddingLeft: "17px" }}>
          {contracts.map((contract) => {
            const isActive = contract.id === selectedContractId;
            return (
              <button
                key={contract.id}
                type="button"
                onClick={() => {
                  setSelectedContractId(contract.id);
                  onContractDetected(contract.id);
                  onContractInfo?.(contract);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "2px 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: isActive ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  fontWeight: isActive ? 600 : 400,
                  width: "100%",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: isActive ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-muted)",
                    flexShrink: 0,
                  }}
                />
                {contract.quote_number}
                {contract.quotation_name && (
                  <span style={{ fontWeight: 400, color: "var(--theme-text-muted)" }}>
                    - {contract.quotation_name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        marginTop: "6px",
        paddingLeft: "2px",
      }}
    >
      <Link2 size={12} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
      <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
        Linked to{" "}
        <span style={{ fontWeight: 600, color: "var(--theme-text-primary)" }}>
          {selected.quote_number}
        </span>
        {selected.quotation_name && (
          <span style={{ color: "var(--theme-text-muted)" }}> - {selected.quotation_name}</span>
        )}
      </span>
    </div>
  );
}
