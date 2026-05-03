// CatalogItemCombobox — Shared combobox for selecting/creating catalog items
// Portal-based dropdown (matching CustomDropdown pattern), names-only display, one-click create

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../../utils/supabase/client";

// ==================== TYPES ====================

export interface CatalogItem {
  id: string;
  name: string;
  category_id: string | null;
  /** Master currency for this item (e.g. "USD" for ocean freight billed by carrier in USD). */
  currency?: string | null;
  /** Master default unit price in `currency`. */
  default_price?: number | null;
  created_at?: string;
  updated_at?: string;
}

/** Metadata emitted alongside the description when a catalog item is selected. */
export interface CatalogSelectionMeta {
  currency?: string | null;
  default_price?: number | null;
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
  side?: "revenue" | "expense" | "both"; // filter items by category side
  categoryId?: string;                  // when set, shows only items in this catalog category + assigns on quick-create
  onChange: (description: string, catalogItemId?: string, meta?: CatalogSelectionMeta) => void;
  disabled?: boolean;
  placeholder?: string;
}

// ==================== FUZZY MATCH ====================

/** Simple similarity check: case-insensitive, catches near-duplicates */
function findSimilarItems(name: string, items: CatalogItem[]): CatalogItem[] {
  const lower = name.toLowerCase().trim();
  if (!lower) return [];
  return items.filter((item) => {
    const itemLower = item.name.toLowerCase();
    if (itemLower === lower) return true; // exact match (shouldn't happen — exactMatch blocks create button)
    // Check if one contains the other (e.g., "THC" vs "THC Charges")
    if (itemLower.includes(lower) || lower.includes(itemLower)) return true;
    // Levenshtein distance ≤ 2 for short names
    if (lower.length <= 12 && levenshtein(lower, itemLower) <= 2) return true;
    return false;
  });
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ==================== CACHE ====================

// Module-level cache so all combobox instances share one fetch
let cachedItems: CatalogItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60_000; // 5 minutes — matches React Query default gcTime

// Cache also stores category side info for filtering
let cachedCategorySides: Record<string, string> = {};

// Singleton in-flight promise — deduplicates concurrent calls so N combobox
// instances opening at the same time share a single pair of HTTP requests
// instead of each firing their own (which exhausts the connection pool).
let inflight: Promise<CatalogItem[]> | null = null;

async function fetchCatalogItems(forceRefresh = false): Promise<CatalogItem[]> {
  if (!forceRefresh && cachedItems && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedItems;
  }
  // Return existing in-flight request if one is already running
  if (inflight) return inflight;

  // CRITICAL: Promise.race guarantees this resolves within 8s even if
  // supabase.from() hangs at the auth layer BEFORE fetch() is called.
  // AbortController only works once fetch starts — if the Supabase client
  // blocks on session/token refresh internally, the abort signal goes
  // unheard and the promise hangs forever. Promise.race is the outer safety net.
  inflight = Promise.race([
    doFetchCatalogItems(),
    new Promise<CatalogItem[]>((resolve) =>
      setTimeout(() => {
        console.warn('fetchCatalogItems: hard timeout — returning cached data');
        resolve(cachedItems || []);
      }, 8_000)
    ),
  ]).finally(() => { inflight = null; });

  return inflight;
}

async function doFetchCatalogItems(): Promise<CatalogItem[]> {
  try {
    const [itemsRes, catsRes] = await Promise.all([
      supabase.from('catalog_items').select('id, name, category_id, currency, default_price, created_at, updated_at').order('name'),
      supabase.from('catalog_categories').select('id, side'),
    ]);

    if (!itemsRes.error && itemsRes.data) {
      cachedItems = itemsRes.data;
      cacheTimestamp = Date.now();
    }
    if (!catsRes.error && catsRes.data) {
      cachedCategorySides = {};
      for (const cat of catsRes.data) {
        cachedCategorySides[cat.id] = cat.side || "both";
      }
    }
    return cachedItems || [];
  } catch (err: any) {
    console.error('fetchCatalogItems failed:', err?.message ?? err);
  }
  return cachedItems || [];
}

/** Filter items by category side */
function filterBySide(items: CatalogItem[], side?: string): CatalogItem[] {
  if (!side || side === "both") return items;
  return items.filter((item) => {
    if (!item.category_id) return true; // uncategorized items show everywhere
    const catSide = cachedCategorySides[item.category_id];
    return catSide === side || catSide === "both";
  });
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
  side,
  categoryId,
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
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    fetchCatalogItems().then((data) => {
      if (!cancelled) {
        setItems(filterBySide(data, side));
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, side]);

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

  // Filter items — category items first, then rest alphabetically
  const getFilteredItems = useCallback((): CatalogItem[] => {
    const query = searchText.toLowerCase().trim();
    const filtered = query
      ? items.filter(item => item.name.toLowerCase().includes(query))
      : [...items];
    return filtered.sort((a, b) => {
      // Items in the current category sort before others
      const aInCat = categoryId && a.category_id === categoryId ? 0 : 1;
      const bInCat = categoryId && b.category_id === categoryId ? 0 : 1;
      if (aInCat !== bInCat) return aInCat - bInCat;
      return a.name.localeCompare(b.name);
    });
  }, [items, searchText, categoryId]);

  // Check if typed text exactly matches an existing item
  const exactMatch = items.some((item) => {
    const sameName = item.name.toLowerCase() === searchText.toLowerCase().trim();
    return sameName && (!categoryId || item.category_id === categoryId);
  });

  // Handle selecting an existing item
  const handleSelect = (item: CatalogItem) => {
    setSearchText(item.name);
    onChange(item.name, item.id, {
      currency: item.currency ?? null,
      default_price: item.default_price ?? null,
    });
    setIsOpen(false);
  };

  // Handle one-click quick create — with fuzzy duplicate check (scoped to same category)
  const handleQuickCreate = async () => {
    const name = searchText.trim();
    if (!name || isCreating) return;

    // Fuzzy duplicate detection — only check items in the same category (or globally if no category)
    const allItems = cachedItems || items;
    const scopedItems = categoryId
      ? allItems.filter((i) => i.category_id === categoryId)
      : allItems;
    const similar = findSimilarItems(name, scopedItems);
    if (similar.length > 0) {
      const names = similar.slice(0, 3).map((s) => `"${s.name}"`).join(", ");
      if (!confirm(`Similar item${similar.length > 1 ? "s" : ""} already exist: ${names}.\n\nCreate "${name}" anyway?`)) {
        return;
      }
    }

    setIsCreating(true);

    try {
      // Promise.race provides a hard timeout that works even if supabase.from()
      // hangs at the auth layer before fetch() is called (where AbortController
      // can't help). This prevents the "Adding..." state from lasting forever.
      const result = await Promise.race([
        supabase
          .from('catalog_items')
          .insert({ id: `ci-${Date.now()}`, name, ...(categoryId ? { category_id: categoryId } : {}) })
          .select('id, name, category_id, currency, default_price, created_at, updated_at')
          .single(),
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: 'Request timed out' } }), 10_000)
        ),
      ]);
      const data = result.data as CatalogItem | null;
      const error = result.error;

      if (!error && data) {
        // Update cache in-place so the new item is available immediately
        // without triggering a re-fetch (which can race with a background auth refresh).
        // NOTE: We intentionally do NOT call queryClient.invalidateQueries here.
        // That would invalidate all catalog keys (items, categories, usageCounts, matrix),
        // triggering a cascade of refetches across the app that exhausts the Supabase
        // connection pool on the dev instance. The module cache update is sufficient for
        // combobox UX; CatalogManagementPage will pick up the new item on its own staleTime.
        if (cachedItems) {
          cachedItems = [...cachedItems, data].sort((a, b) => a.name.localeCompare(b.name));
          cacheTimestamp = Date.now();
        } else {
          invalidateCache();
        }
        handleSelect(data);
        toast.success(`"${data.name}" added to catalog`);
      } else {
        console.error("Error creating catalog item:", error);
        toast.error(`Failed to add item: ${error?.message ?? (error as any)?.code ?? "unknown error"}`);
      }
    } catch (err: any) {
      console.error("Error creating catalog item:", err);
      toast.error(`Failed to add item: ${err?.message ?? String(err)}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle input change — fire onChange with just description (clears catalog link)
  const handleInputChange = (text: string) => {
    setSearchText(text);
    if (!isOpen) setIsOpen(true);
    onChange(text, undefined, undefined);
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
