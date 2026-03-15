/**
 * ConsigneePicker — Shared combo-box for selecting or typing a consignee.
 *
 * Shows a searchable dropdown of saved consignees for the selected customer,
 * with a free-text fallback. When a saved consignee is selected, both
 * `consignee` (text) and `consignee_id` are returned. When free-text is typed,
 * only `consignee` is returned (consignee_id is undefined).
 *
 * @see /docs/blueprints/CONSIGNEE_FEATURE_BLUEPRINT.md — Phase 2
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Building2, Plus, X } from "lucide-react";
import type { Consignee } from "../../types/bd";
import { apiFetch } from "../../utils/api";

interface ConsigneePickerProps {
  /** Current free-text value of the consignee field */
  value: string;
  /** Called when value changes — text name of the consignee */
  onChange: (value: string) => void;
  /** Called when a saved consignee is selected — provides the ID */
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
  placeholder = "Consignee name",
  style,
  className,
}: ConsigneePickerProps) {
  const [consignees, setConsignees] = useState<Consignee[]>([]);
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | undefined>(directCustomerId);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve customerId from customerName if not directly provided
  useEffect(() => {
    if (directCustomerId) {
      setResolvedCustomerId(directCustomerId);
      return;
    }
    if (!customerName?.trim()) {
      setResolvedCustomerId(undefined);
      setConsignees([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/customers`);
        const json = await res.json();
        if (cancelled) return;
        const customers = json.data || [];
        const match = customers.find(
          (c: any) =>
            (c.name || c.company_name || "").toLowerCase() === customerName.trim().toLowerCase()
        );
        setResolvedCustomerId(match?.id || undefined);
      } catch {
        if (!cancelled) setResolvedCustomerId(undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [customerName, directCustomerId]);

  // Fetch consignees when customerId is resolved
  useEffect(() => {
    if (!resolvedCustomerId) {
      setConsignees([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/consignees?customer_id=${encodeURIComponent(resolvedCustomerId)}`
        );
        const json = await res.json();
        if (!cancelled && json.success) {
          setConsignees(json.data || []);
        }
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [resolvedCustomerId]);

  // Sync searchText with external value
  useEffect(() => {
    setSearchText(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredConsignees = consignees.filter((c) =>
    c.name.toLowerCase().includes((searchText || "").toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchText(val);
    onChange(val);
    onConsigneeIdChange?.(undefined); // Free-text clears ID
    if (val.trim() && consignees.length > 0) {
      setIsOpen(true);
    }
  };

  const handleSelect = (consignee: Consignee) => {
    setSearchText(consignee.name);
    onChange(consignee.name);
    onConsigneeIdChange?.(consignee.id);
    setIsOpen(false);
  };

  const handleFocus = () => {
    if (consignees.length > 0) {
      setIsOpen(true);
    }
  };

  const handleClear = () => {
    setSearchText("");
    onChange("");
    onConsigneeIdChange?.(undefined);
    inputRef.current?.focus();
  };

  const hasConsignees = consignees.length > 0;

  const defaultStyle: React.CSSProperties = {
    border: "1px solid var(--neuron-ui-border, #E5E9F0)",
    color: "#12332B",
    backgroundColor: "white",
    ...style,
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={className || "w-full px-3.5 py-2.5 rounded-lg text-[13px]"}
          style={{
            ...defaultStyle,
            paddingRight: hasConsignees ? "60px" : "12px",
          }}
        />
        {/* Right-side icons */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchText && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" style={{ color: "#98A2B3" }} />
            </button>
          )}
          {hasConsignees && (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronDown
                className="w-4 h-4 transition-transform"
                style={{
                  color: "#667085",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && hasConsignees && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{
            border: "1px solid #E5E9F0",
            backgroundColor: "white",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {filteredConsignees.length > 0 ? (
            filteredConsignees.map((csg) => (
              <button
                key={csg.id}
                type="button"
                onClick={() => handleSelect(csg)}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-start gap-2.5"
                style={{ borderBottom: "1px solid #F2F4F7" }}
              >
                <Building2
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: "#0F766E" }}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: "#12332B" }}>
                    {csg.name}
                  </div>
                  {(csg.address || csg.tin) && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: "#98A2B3" }}>
                      {[csg.address, csg.tin ? `TIN: ${csg.tin}` : null]
                        .filter(Boolean)
                        .join(" \u00B7 ")}
                    </div>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-center">
              <p className="text-[12px]" style={{ color: "#98A2B3" }}>
                No matching consignees
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}