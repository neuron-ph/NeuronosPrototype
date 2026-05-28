import { Search, X, FileText, Layers } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import { fetchTemplates, resolveAndLoadTemplate } from "../../../utils/categoryTemplates";
import type { CategoryTemplate } from "../../../types/categoryTemplates";
import type { SellingPriceLineItem } from "../../../types/pricing";
import { toast } from "../../ui/toast-utils";

interface LoadTemplateDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName: string;
  onLoad: (items: SellingPriceLineItem[]) => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export function LoadTemplateDropdown({ isOpen, onClose, categoryName, onLoad, buttonRef }: LoadTemplateDropdownProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const { data: allTemplates = [] } = useQuery({
    queryKey: queryKeys.catalog.templates(),
    queryFn: fetchTemplates,
    enabled: isOpen,
  });

  const templates = allTemplates.filter(
    (t) => t.category_name.toLowerCase().trim() === categoryName.toLowerCase().trim()
  );

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updatePosition = () => {
    if (buttonRef?.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    } else {
      setDropdownPosition({
        top: window.innerHeight / 2 - 200,
        right: window.innerWidth / 2 - 170,
      });
    }
  };

  useEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => updatePosition();
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current?.contains(event.target as Node)) return;
      if (buttonRef?.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, buttonRef]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleSelect = async (template: CategoryTemplate) => {
    setLoading(template.id);
    try {
      const resolved = await resolveAndLoadTemplate(template);
      onLoad(resolved.line_items);
      toast.success(`Template "${template.name}" loaded`);
      onClose();
      setSearchQuery("");
    } catch (err: any) {
      toast.error(err.message || "Failed to load template");
    } finally {
      setLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: dropdownPosition.top,
        right: dropdownPosition.right,
        width: "340px",
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        zIndex: 50,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: "400px",
      }}
    >
      {/* Search */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "var(--theme-bg-surface-subtle)",
          borderBottom: "1px solid var(--theme-border-subtle)",
          flexShrink: 0,
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", color: "var(--theme-text-muted)" }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            style={{
              width: "100%",
              padding: "8px 36px 8px 36px",
              fontSize: "13px",
              color: "var(--theme-text-primary)",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "6px",
              outline: "none",
              backgroundColor: "var(--theme-bg-surface)",
              transition: "all 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(15, 118, 110, 0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--theme-border-default)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: "8px",
                padding: "4px",
                border: "none",
                backgroundColor: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                borderRadius: "4px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <X size={14} style={{ color: "var(--theme-text-muted)" }} />
            </button>
          )}
        </div>
      </div>

      {/* Template list */}
      <div style={{ padding: "8px 0", overflowY: "auto", flex: 1, minHeight: "60px" }}>
        <div
          style={{
            padding: "8px 16px 4px 16px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--theme-text-muted)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Templates for {categoryName}
        </div>

        {filtered.length > 0 ? (
          filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t)}
              disabled={loading === t.id}
              style={{
                width: "100%",
                padding: "10px 16px",
                border: "none",
                backgroundColor: "var(--theme-bg-surface)",
                textAlign: "left",
                cursor: loading === t.id ? "wait" : "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                opacity: loading === t.id ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (loading !== t.id) e.currentTarget.style.backgroundColor = "var(--theme-state-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileText size={14} style={{ color: "var(--neuron-brand-green)", flexShrink: 0 }} />
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                  {t.name}
                </span>
              </div>
              <div style={{ paddingLeft: "22px", fontSize: "11px", color: "var(--theme-text-muted)" }}>
                {t.items.length} item{t.items.length !== 1 ? "s" : ""}
                {t.description && ` — ${t.description}`}
              </div>
            </button>
          ))
        ) : (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px" }}>
            {templates.length === 0
              ? `No templates saved for "${categoryName}" yet.`
              : "No matching templates."}
          </div>
        )}
      </div>
    </div>
  );
}
