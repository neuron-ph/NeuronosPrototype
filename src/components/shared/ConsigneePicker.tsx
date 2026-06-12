/**
 * ConsigneePicker — Dropdown for selecting one of the customer's saved consignees.
 *
 * Strictly bound to the customer's consignee list (table: `consignees` scoped by
 * `customer_id`). The text input filters the dropdown but does NOT commit a value
 * on its own — a consignee is only set when the user picks one from the list.
 * Free-text entry is intentionally disallowed so booking consignees always link
 * back to a managed customer profile record.
 *
 * @see /docs/blueprints/CONSIGNEE_FEATURE_BLUEPRINT.md — Phase 2
 */

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Building2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Consignee } from "../../types/bd";
import { supabase } from "../../utils/supabase/client";
import { queryKeys } from "../../lib/queryKeys";

interface ConsigneePickerProps {
  /** Current committed consignee display name */
  value: string;
  /** Called when value changes — text name of the consignee (or "" when cleared) */
  onChange: (value: string) => void;
  /** Called when a saved consignee is selected — provides the ID (or undefined when cleared) */
  onConsigneeIdChange?: (consigneeId: string | undefined) => void;
  /** Customer name — used to look up customer_id and fetch consignees */
  customerName?: string;
  /** Direct customer ID — preferred over customerName if provided */
  customerId?: string;
  /** Input placeholder */
  placeholder?: string;
  /** Input style override */
  style?: React.CSSProperties;
  /** Input className override */
  className?: string;
}

export function ConsigneePicker({
  value,
  onChange,
  onConsigneeIdChange,
  customerName,
  customerId: directCustomerId,
  placeholder = "Select consignee/shipper...",
  style,
  className,
}: ConsigneePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: resolvedCustomerId } = useQuery({
    queryKey: [queryKeys.customers.list()[0], "resolve_by_name", customerName ?? "", directCustomerId ?? ""],
    queryFn: async () => {
      if (directCustomerId) return directCustomerId;
      if (!customerName?.trim()) return null;
      const { data } = await supabase.from('customers').select('id, name, company_name').ilike('company_name', customerName.trim());
      const customers = data || [];
      const match = customers.find(
        (c: any) => (c.name || c.company_name || "").toLowerCase() === customerName.trim().toLowerCase()
      );
      return match?.id ?? null;
    },
    enabled: !!directCustomerId || !!customerName?.trim(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: consignees = [] } = useQuery({
    queryKey: ["consignees", resolvedCustomerId ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase.from('consignees').select('*').eq('customer_id', resolvedCustomerId!);
      if (error) return [] as Consignee[];
      return (data || []) as Consignee[];
    },
    enabled: !!resolvedCustomerId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchText("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasCustomer = !!resolvedCustomerId;
  const hasConsignees = consignees.length > 0;
  const disabled = !hasCustomer;

  const filteredConsignees = consignees.filter((c) =>
    c.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleSelect = (consignee: Consignee) => {
    onChange(consignee.name);
    onConsigneeIdChange?.(consignee.id);
    setSearchText("");
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    onConsigneeIdChange?.(undefined);
    setSearchText("");
    inputRef.current?.focus();
  };

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(prev => {
      const next = !prev;
      if (next) {
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setSearchText("");
      }
      return next;
    });
  };

  const defaultStyle: React.CSSProperties = {
    border: "1px solid var(--neuron-ui-border, #E5E9F0)",
    color: "var(--theme-text-primary)",
    backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    ...style,
  };

  const triggerClassName =
    className ||
    "w-full px-3.5 py-2.5 rounded-lg text-[13px] flex items-center justify-between gap-2";

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger: shows committed value or placeholder; click to open */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        title={disabled ? "Select a customer first" : undefined}
        className={triggerClassName}
        style={defaultStyle}
      >
        <span
          className="truncate text-left"
          style={{
            color: value ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
          }}
        >
          {value || (disabled ? "Select customer first" : placeholder)}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <X
              role="button"
              onClick={handleClear}
              className="w-3.5 h-3.5"
              style={{ color: "var(--theme-text-muted)" }}
            />
          )}
          <ChevronDown
            className="w-4 h-4 transition-transform"
            style={{
              color: "var(--theme-text-muted)",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </span>
      </button>

      {isOpen && !disabled && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{
            border: "1px solid var(--theme-border-default)",
            backgroundColor: "var(--theme-bg-surface)",
          }}
        >
          {/* Search filter — does NOT commit a value, only filters the list */}
          <div className="p-2" style={{ borderBottom: "1px solid var(--theme-border-default)" }}>
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search consignees..."
              className="w-full px-2.5 py-1.5 rounded-md text-[13px] outline-none"
              style={{
                border: "1px solid var(--neuron-ui-border, #E5E9F0)",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            />
          </div>

          <div
            className="scrollbar-hide"
            style={{
              maxHeight: "220px",
              overflowY: "auto",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {!hasConsignees ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                  No consignees saved for this customer.
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
                  Add one from the customer's profile.
                </p>
              </div>
            ) : filteredConsignees.length === 0 ? (
              <div className="px-3 py-3 text-center">
                <p className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                  No matching consignees
                </p>
              </div>
            ) : (
              filteredConsignees.map((csg) => (
                <button
                  key={csg.id}
                  type="button"
                  onClick={() => handleSelect(csg)}
                  className="w-full text-left px-3 py-2.5 hover:bg-[var(--theme-bg-surface-subtle)] transition-colors flex items-start gap-2.5"
                  style={{ borderBottom: "1px solid var(--theme-border-default)" }}
                >
                  <Building2
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{ color: "var(--theme-action-primary-bg)" }}
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: "var(--theme-text-primary)" }}>
                      {csg.name}
                    </div>
                    {(csg.address || csg.tin) && (
                      <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--theme-text-muted)" }}>
                        {[csg.address, csg.tin ? `TIN: ${csg.tin}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
