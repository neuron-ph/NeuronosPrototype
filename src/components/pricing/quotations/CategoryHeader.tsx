/**
 * CategoryHeader Component
 * 
 * Collapsible header for category sections in pricing tables.
 * Features: expand/collapse, inline rename, item count, actions menu.
 */

import { useState, useRef, useEffect } from "react";
import { ChevronRight, Plus, MoreVertical, Edit2, Copy, Trash2, Check, X, Package } from "lucide-react";
import type { BuyingPriceCategory, SellingPriceCategory } from "../../../types/pricing";

interface CategoryHeaderProps {
  category: BuyingPriceCategory | SellingPriceCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onAddItem: () => void;
  onRename: (newName: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  viewMode?: boolean;
}

export function CategoryHeader({
  category,
  isExpanded,
  onToggle,
  onAddItem,
  onRename,
  onDuplicate,
  onDelete,
  viewMode = false
}: CategoryHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(category.category_name);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const itemCount = category.line_items.length;
  const itemLabel = itemCount === 1 ? "item" : "items";

  const handleSaveRename = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== category.category_name) {
      onRename(trimmedValue);
    }
    setIsEditing(false);
    setEditValue(category.category_name);
  };

  const handleCancelRename = () => {
    setIsEditing(false);
    setEditValue(category.category_name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveRename();
    } else if (e.key === "Escape") {
      handleCancelRename();
    }
  };

  const handleAddItemClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddItem();
  };

  const handleActionsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowActionsMenu(!showActionsMenu);
  };

  const handleRenameClick = () => {
    setShowActionsMenu(false);
    setIsEditing(true);
  };

  const handleDuplicateClick = () => {
    setShowActionsMenu(false);
    onDuplicate();
  };

  const handleDeleteClick = () => {
    setShowActionsMenu(false);
    onDelete();
  };

  return (
    <div
      style={{
        backgroundColor: "var(--theme-bg-page)",
        border: "none",
        borderRadius: "10px 10px 0 0",
        padding: "12px 16px",
        cursor: isEditing ? "default" : "pointer",
        transition: "all 0.2s ease"
      }}
      onClick={isEditing ? undefined : onToggle}
      onMouseEnter={(e) => {
        if (!isEditing) {
          e.currentTarget.style.backgroundColor = "#EDF2F1";
        }
      }}
      onMouseLeave={(e) => {
        if (!isEditing) {
          e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Chevron Icon */}
        <ChevronRight
          size={16}
          style={{
            color: "var(--theme-text-muted)",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            flexShrink: 0
          }}
        />

        {/* Package Icon */}
        <Package size={16} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />

        {/* Category Name or Edit Input */}
        {isEditing ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }} onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                padding: "6px 10px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#2C3E38",
                border: "1px solid #0F766E",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                boxShadow: "0 0 0 3px rgba(15, 118, 110, 0.1)"
              }}
            />
            <button
              onClick={handleSaveRename}
              style={{
                padding: "6px",
                border: "1px solid #0F766E",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface-tint)",
                color: "var(--theme-action-primary-bg)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#D1EDE8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
              }}
            >
              <Check size={16} />
            </button>
            <button
              onClick={handleCancelRename}
              style={{
                padding: "6px",
                border: "1px solid #E5E9E8",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--theme-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              }}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            {/* Category Name */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#2C3E38",
                  letterSpacing: "0.01em"
                }}
              >
                {category.category_name}
              </span>
              
              {/* Item Count Badge */}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--theme-text-muted)",
                  backgroundColor: "var(--theme-bg-surface)",
                  padding: "2px 6px",
                  borderRadius: "4px"
                }}
              >
                {itemCount} {itemLabel}
              </span>
            </div>

            {/* Right Side Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* + Add Item Button - Hidden in View Mode */}
              {!viewMode && (
              <button
                onClick={handleAddItemClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--theme-action-primary-bg)",
                  backgroundColor: "transparent",
                  border: "1px solid #E5E9E8",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Plus size={12} />
                Add Item
              </button>
              )}

              {/* Actions Menu (⋮) - Hidden in View Mode */}
              {!viewMode && (
              <div style={{ position: "relative" }} ref={menuRef}>
                <button
                  onClick={handleActionsClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    color: "var(--theme-text-muted)",
                    backgroundColor: "transparent",
                    border: "1px solid #E5E9E8",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#EDF2F1";
                    e.currentTarget.style.borderColor = "#6B7A76";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.borderColor = "#E5E9E8";
                  }}
                >
                  <MoreVertical size={14} />
                </button>

                {/* Dropdown Menu */}
                {showActionsMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      right: 0,
                      backgroundColor: "var(--theme-bg-surface)",
                      border: "1px solid #E5E9E8",
                      borderRadius: "8px",
                      overflow: "hidden",
                      zIndex: 100,
                      minWidth: "160px",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)"
                    }}
                  >
                    <button
                      onClick={handleRenameClick}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        fontSize: "13px",
                        color: "#2C3E38",
                        backgroundColor: "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--theme-border-subtle)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background-color 0.15s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <Edit2 size={14} />
                      Rename
                    </button>

                    <button
                      onClick={handleDuplicateClick}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        fontSize: "13px",
                        color: "#2C3E38",
                        backgroundColor: "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--theme-border-subtle)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background-color 0.15s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <Copy size={14} />
                      Duplicate
                    </button>

                    <button
                      onClick={handleDeleteClick}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        fontSize: "13px",
                        color: "var(--theme-status-danger-fg)",
                        backgroundColor: "transparent",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background-color 0.15s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#FEF2F2";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}