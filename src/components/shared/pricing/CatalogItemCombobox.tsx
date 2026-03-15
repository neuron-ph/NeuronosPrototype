// CatalogItemCombobox — Shared combobox for selecting/creating expense & charge catalog items
// Portal-based dropdown (matching CustomDropdown pattern), names-only display, one-click create

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { apiFetch } from "../../../utils/api";

// ==================== TYPES ====================

export interface CatalogItem {
  id: string;
  name: string;
  type: "expense" | "charge" | "both";
  category: string;
  service_types: string[];
  default_currency: string;
  default_amount: number | null;
  is_taxable: boolean;
  is_active: boolean;
}

interface CatalogItemComboboxProps {
  value: string;                        // current description text
  catalogItemId?: string;               // current linked catalog item ID
  serviceType?: string;                 // current booking's service type for smart sorting
  itemType?: "expense" | "charge" | "both"; // inferred from context (billings=charge, expenses=expense)
  onChange: (description: string, catalogItemId?: string, defaults?: {
    currency?: string;
    is_taxable?: boolean;
    default_amount?: number | null;
    type?: string;
  }) => void;
  disabled?: boolean;
  placeholder?: string;
}

// ==================== CACHE ====================

// Module-level cache so all combobox instances share one fetch
let cachedItems: CatalogItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function fetchCatalogItems(forceRefresh = false): Promise<CatalogItem[]> {
  if (!forceRefresh && cachedItems && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedItems;
  }
  try {
    const res = await apiFetch(`/catalog/items`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      cachedItems = json.data;
      cacheTimestamp = Date.now();
      return json.data;
    }
  } catch (err) {
    console.error("Error fetching catalog items:", err);
  }
  return cachedItems || [];
}

// Invalidate cache (called after creating a new item)
function invalidateCache() {
  cachedItems = null;
  cacheTimestamp = 0;
}

// ==================== COMPONENT ====================

export function CatalogItemCombobox({
  value,
  catalogItemId,
  serviceType,
  itemType = "both",
  onChange,
  disabled = false,
  placeholder = "Item description",
}: CatalogItemComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState(value || "");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  // Sync searchText when value changes externally
  useEffect(() => {
    if (!isOpen) {
      setSearchText(value || "");
    }
  }, [value, isOpen]);

  // Load items when opening
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchCatalogItems().then((data) => {
        setItems(data);
        setIsLoading(false);
      });
    }
  }, [isOpen]);

  // Compute position when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
    }
  }, [isOpen]);

  // Reposition on scroll (reposition, not close — matching CustomDropdown)
  useEffect(() => {
    if (!isOpen || !inputRef.current) return;
    const updatePosition = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
      }
    };
    window.addEventListener("scroll", updatePosition, true);
    return () => window.removeEventListener("scroll", updatePosition, true);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
        // Restore value if user didn't select anything
        setSearchText(value || "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, value]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearchText(value || "");
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, value]);

  // Filter and sort items
  const getFilteredItems = useCallback(() => {
    const query = searchText.toLowerCase().trim();
    let filtered = items;

    if (query) {
      filtered = items.filter((item) =>
        item.name.toLowerCase().includes(query)
      );
    }

    // Split into service-type-matching and others
    const matching: CatalogItem[] = [];
    const others: CatalogItem[] = [];

    for (const item of filtered) {
      if (serviceType && item.service_types?.includes(serviceType)) {
        matching.push(item);
      } else {
        others.push(item);
      }
    }

    matching.sort((a, b) => a.name.localeCompare(b.name));
    others.sort((a, b) => a.name.localeCompare(b.name));

    return { matching, others };
  }, [items, searchText, serviceType]);

  // Check if typed text exactly matches an existing item
  const exactMatch = items.some(
    (item) => item.name.toLowerCase() === searchText.toLowerCase().trim()
  );

  // Handle selecting an existing item
  const handleSelect = (item: CatalogItem) => {
    setSearchText(item.name);
    onChange(item.name, item.id, {
      currency: item.default_currency,
      is_taxable: item.is_taxable,
      default_amount: item.default_amount,
      type: item.type,
    });
    setIsOpen(false);
  };

  // Handle one-click quick create — no form, just POST immediately
  const handleQuickCreate = async () => {
    const name = searchText.trim();
    if (!name || isCreating) return;
    setIsCreating(true);

    try {
      const res = await apiFetch(`/catalog/items`, {
        method: "POST",
        body: JSON.stringify({
          name,
          type: itemType,
          category: name,
          service_types: serviceType ? [serviceType] : [],
          default_currency: "PHP",
          is_taxable: itemType === "charge" || itemType === "both",
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        invalidateCache();
        handleSelect(json.data);
      } else {
        console.error("Error creating catalog item:", json.error);
      }
    } catch (err) {
      console.error("Error creating catalog item:", err);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle input change — also fire onChange with just description (no catalog link)
  const handleInputChange = (text: string) => {
    setSearchText(text);
    if (!isOpen) setIsOpen(true);
    // If user is typing freely, clear the catalog link
    onChange(text, undefined);
  };

  const { matching, others } = getFilteredItems();
  const hasResults = matching.length > 0 || others.length > 0;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="text"
        value={searchText}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true);
            // Select all text on focus for easy replacement
            inputRef.current?.select();
          }
        }}
        placeholder={placeholder}
        title={searchText}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: "13px",
          border: "1px solid #E0E6E4",
          borderRadius: "6px",
          backgroundColor: disabled ? "#F9FAFB" : "white",
          fontWeight: 500,
          color: "#2C3E38",
          transition: "all 0.15s ease",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: disabled ? "default" : "text",
          outline: "none",
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "#C7D0CC";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && document.activeElement !== e.currentTarget) {
            e.currentTarget.style.borderColor = "#E0E6E4";
          }
        }}
        onBlur={(e) => {
          // Don't reset border if dropdown is open (click-outside handles close)
          if (!isOpen) {
            e.currentTarget.style.borderColor = "#E0E6E4";
            e.currentTarget.style.boxShadow = "none";
          }
        }}
      />

      {/* Portal Dropdown */}
      {isOpen && !disabled && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            minWidth: menuPos.minWidth,
            width: "max-content",
            maxWidth: "360px",
            maxHeight: "280px",
            overflowY: "auto",
            backgroundColor: "#FFFFFF",
            border: "1px solid #E0E6E4",
            borderRadius: "8px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            zIndex: 9999,
            fontSize: "13px",
          }}
        >
            {/* ==================== DROPDOWN LIST ==================== */}
              {isLoading && (
                <div style={{ padding: "8px 12px", color: "#9CA3AF", fontSize: "12px" }}>
                  Loading...
                </div>
              )}

              {!isLoading && !hasResults && searchText.trim() && (
                <div style={{ padding: "8px 12px", color: "#9CA3AF", fontSize: "12px" }}>
                  No matching items
                </div>
              )}

              {/* Service-type-matching items */}
              {matching.length > 0 && (
                <>
                  {others.length > 0 && serviceType && (
                    <div style={{
                      padding: "6px 12px 2px",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "#9CA3AF",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}>
                      {serviceType}
                    </div>
                  )}
                  {matching.map((item) => (
                    <ItemOption key={item.id} item={item} onSelect={handleSelect} />
                  ))}
                </>
              )}

              {/* Divider between groups */}
              {matching.length > 0 && others.length > 0 && (
                <div style={{
                  margin: "2px 12px",
                  borderTop: "1px solid #F0F0F0",
                }} />
              )}

              {/* Other items */}
              {others.length > 0 && (
                <>
                  {matching.length > 0 && (
                    <div style={{
                      padding: "6px 12px 2px",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "#9CA3AF",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}>
                      Other
                    </div>
                  )}
                  {others.map((item) => (
                    <ItemOption key={item.id} item={item} onSelect={handleSelect} />
                  ))}
                </>
              )}

              {/* Quick-add option — one click, no form */}
              {searchText.trim() && !exactMatch && (
                <>
                  <div style={{ margin: "2px 12px", borderTop: "1px solid #F0F0F0" }} />
                  <button
                    type="button"
                    onClick={handleQuickCreate}
                    disabled={isCreating}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      color: isCreating ? "#9CA3AF" : "#0F766E",
                      fontWeight: 500,
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: isCreating ? "not-allowed" : "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (!isCreating) e.currentTarget.style.backgroundColor = "#F0FDFA"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <Plus size={14} />
                    {isCreating
                      ? "Adding..."
                      : `Add "${searchText.trim().length > 30 ? searchText.trim().substring(0, 30) + "..." : searchText.trim()}"`
                    }
                  </button>
                </>
              )}

              {/* Empty state: no search, show all */}
              {!isLoading && !searchText.trim() && !hasResults && (
                <div style={{ padding: "8px 12px", color: "#9CA3AF", fontSize: "12px" }}>
                  No catalog items yet
                </div>
              )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ==================== ITEM OPTION ====================

function ItemOption({
  item,
  onSelect,
}: {
  item: CatalogItem;
  onSelect: (item: CatalogItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={{
        width: "100%",
        padding: "7px 12px",
        display: "block",
        fontSize: "13px",
        color: "#2C3E38",
        fontWeight: 400,
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#F9FAFB"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {item.name}
    </button>
  );
}