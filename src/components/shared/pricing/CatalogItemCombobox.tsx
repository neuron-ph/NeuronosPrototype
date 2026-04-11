// CatalogItemCombobox — Shared combobox for selecting/creating catalog items
// Portal-based dropdown (matching CustomDropdown pattern), names-only display, one-click create

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";

// ==================== TYPES ====================

export interface CatalogItem {
  id: string;
  name: string;
  category_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  description?: string | null;
  sort_order: number;
  is_default: boolean;
  item_count?: number;
}

interface CatalogItemComboboxProps {
  value: string;                        // current description text
  catalogItemId?: string;               // current linked catalog item ID
  serviceType?: string;                 // kept for future smart-sort when we link catalog → service
  onChange: (description: string, catalogItemId?: string) => void;
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
    const { data, error } = await supabase
      .from('catalog_items')
      .select('id, name, category_id, created_at, updated_at')
      .order('name');
    if (!error && data) {
      cachedItems = data;
      cacheTimestamp = Date.now();
      return data;
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

  // Filter items alphabetically
  const getFilteredItems = useCallback((): CatalogItem[] => {
    const query = searchText.toLowerCase().trim();
    if (!query) return [...items].sort((a, b) => a.name.localeCompare(b.name));
    return items
      .filter(item => item.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchText]);

  // Check if typed text exactly matches an existing item
  const exactMatch = items.some(
    (item) => item.name.toLowerCase() === searchText.toLowerCase().trim()
  );

  // Handle selecting an existing item
  const handleSelect = (item: CatalogItem) => {
    setSearchText(item.name);
    onChange(item.name, item.id);
    setIsOpen(false);
  };

  // Handle one-click quick create — no form, just POST immediately
  const handleQuickCreate = async () => {
    const name = searchText.trim();
    if (!name || isCreating) return;
    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from('catalog_items')
        .insert({ name })
        .select('id, name, category_id, created_at, updated_at')
        .single();

      if (!error && data) {
        invalidateCache();
        handleSelect(data);
      } else {
        console.error("Error creating catalog item:", error?.message);
      }
    } catch (err) {
      console.error("Error creating catalog item:", err);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle input change — fire onChange with just description (clears catalog link)
  const handleInputChange = (text: string) => {
    setSearchText(text);
    if (!isOpen) setIsOpen(true);
    onChange(text, undefined);
  };

  const filteredItems = getFilteredItems();
  const hasResults = filteredItems.length > 0;

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
          border: "1px solid var(--theme-border-default)",
          borderRadius: "6px",
          backgroundColor: disabled ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
          fontWeight: 500,
          color: "var(--theme-text-primary)",
          transition: "all 0.15s ease",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: disabled ? "default" : "text",
          outline: "none",
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.borderColor = "var(--theme-border-default)";
        }}
        onMouseLeave={(e) => {
          if (!disabled && document.activeElement !== e.currentTarget) {
            e.currentTarget.style.borderColor = "var(--theme-border-default)";
          }
        }}
        onBlur={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = "var(--theme-border-default)";
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
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            zIndex: 9999,
            fontSize: "13px",
          }}
        >
          {isLoading && (
            <div style={{ padding: "8px 12px", color: "var(--theme-text-muted)", fontSize: "12px" }}>
              Loading...
            </div>
          )}

          {!isLoading && !hasResults && searchText.trim() && (
            <div style={{ padding: "8px 12px", color: "var(--theme-text-muted)", fontSize: "12px" }}>
              No matching items
            </div>
          )}

          {/* Items list */}
          {filteredItems.map((item) => (
            <ItemOption key={item.id} item={item} onSelect={handleSelect} />
          ))}

          {/* Quick-add option — one click, no form */}
          {searchText.trim() && !exactMatch && (
            <>
              {hasResults && <div style={{ margin: "2px 12px", borderTop: "1px solid var(--theme-border-subtle)" }} />}
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
                  color: isCreating ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)",
                  fontWeight: 500,
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: isCreating ? "not-allowed" : "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!isCreating) e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
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

          {!isLoading && !searchText.trim() && !hasResults && (
            <div style={{ padding: "8px 12px", color: "var(--theme-text-muted)", fontSize: "12px" }}>
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
        color: "var(--theme-text-primary)",
        fontWeight: 400,
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {item.name}
    </button>
  );
}
