import { useState, useRef, useEffect } from "react";
import { Search, Plus, FolderPlus } from "lucide-react";
import { AVAILABLE_CHARGE_CATEGORIES } from "../../../constants/quotation-charges";

interface CategoryDropdownProps {
  onAdd: (name: string) => void;
  onClose: () => void;
}

export function CategoryDropdown({ onAdd, onClose }: CategoryDropdownProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const predefinedCategories = AVAILABLE_CHARGE_CATEGORIES;

  const filteredCategories = predefinedCategories.filter(cat =>
    cat.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleSelectCategory = (name: string) => {
    onAdd(name);
    onClose();
  };

  const handleCustomSubmit = () => {
    if (searchTerm.trim()) {
      onAdd(searchTerm.trim().toUpperCase());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && searchTerm.trim()) {
      e.preventDefault();
      // If there's an exact match, use it; otherwise create custom
      const exactMatch = filteredCategories.find(cat => 
        cat.toLowerCase() === searchTerm.toLowerCase()
      );
      if (exactMatch) {
        handleSelectCategory(exactMatch);
      } else {
        handleCustomSubmit();
      }
    }
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        right: 0,
        width: "380px",
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        zIndex: 1000,
        overflow: "hidden"
      }}
    >
      {/* Search Input */}
      <div style={{
        padding: "12px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-page)"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "6px"
        }}>
          <Search size={14} style={{ color: "var(--neuron-ink-muted)" }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or type category name..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "13px",
              backgroundColor: "transparent"
            }}
          />
        </div>
      </div>

      {/* Category List */}
      <div style={{
        maxHeight: "320px",
        overflowY: "auto"
      }}>
        {/* Filtered Preset Categories */}
        {filteredCategories.length > 0 && (
          <div style={{ padding: "8px" }}>
            <div style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--neuron-ink-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              padding: "4px 8px",
              marginBottom: "4px"
            }}>
              Preset Categories
            </div>
            {filteredCategories.map((category) => (
              <button
                key={category}
                onClick={() => handleSelectCategory(category)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid transparent",
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.1s",
                  marginBottom: "4px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#F0FDF4";
                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                  e.currentTarget.style.borderColor = "transparent";
                }}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {/* Custom Category Option */}
        {searchTerm.trim() && !filteredCategories.some(cat => 
          cat.toLowerCase() === searchTerm.toLowerCase()
        ) && (
          <div style={{ 
            padding: "8px",
            borderTop: filteredCategories.length > 0 ? "1px solid var(--neuron-ui-border)" : "none"
          }}>
            <div style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--neuron-ink-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              padding: "4px 8px",
              marginBottom: "4px"
            }}>
              Create Custom
            </div>
            <button
              onClick={handleCustomSubmit}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--theme-action-primary-bg)",
                backgroundColor: "var(--theme-bg-surface-tint)",
                border: "1px solid #0F766E",
                borderRadius: "6px",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.1s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                e.currentTarget.style.color = "white";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                e.currentTarget.style.color = "var(--theme-action-primary-bg)";
              }}
            >
              <Plus size={14} />
              <span>Create "{searchTerm.trim().toUpperCase()}"</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {filteredCategories.length === 0 && !searchTerm.trim() && (
          <div style={{
            padding: "32px 20px",
            textAlign: "center",
            color: "var(--neuron-ink-muted)",
            fontSize: "12px"
          }}>
            <FolderPlus size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
            <p style={{ margin: 0 }}>Type to search or create a custom category</p>
          </div>
        )}
      </div>
    </div>
  );
}