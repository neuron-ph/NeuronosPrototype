import { Search, X, Plus } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface CategoryPreset {
  id: string;
  name: string;
  description?: string;
}

const PRESET_CATEGORIES: CategoryPreset[] = [
  { id: "freight", name: "Freight Charges", description: "Ocean/Air freight rates, fuel surcharges" },
  { id: "origin", name: "Origin Local Charges", description: "Pickup, documentation, export customs" },
  { id: "destination", name: "Destination Local Charges", description: "Delivery, import customs clearance" },
  { id: "reimbursable", name: "Reimbursable Charges", description: "Client-reimbursed expenses" },
  { id: "brokerage", name: "Brokerage Charges", description: "Customs clearance, duties, taxes" },
  { id: "customs", name: "Customs Duty & VAT", description: "Import duties and value-added tax" },
];

interface CategoryPresetDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (categoryName: string) => void;
  buttonRef?: React.RefObject<HTMLButtonElement>; // Made optional
  anchorRef?: React.RefObject<HTMLButtonElement>; // Compatibility prop
}

export function CategoryPresetDropdown({ isOpen, onClose, onSelect, buttonRef, anchorRef }: CategoryPresetDropdownProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  // Use either buttonRef or anchorRef
  const activeRef = buttonRef || anchorRef;

  // Calculate dropdown position
  const updatePosition = () => {
    if (activeRef?.current) {
      const buttonRect = activeRef.current.getBoundingClientRect();
      
      // Simple: just position below the button with a gap
      // No boundary checks - let it follow the button everywhere
      setDropdownPosition({
        top: buttonRect.bottom + 8,
        right: window.innerWidth - buttonRect.right
      });
    } else {
      // Fallback centering if no ref provided
      setDropdownPosition({
        top: window.innerHeight / 2 - 200,
        right: window.innerWidth / 2 - 170
      });
    }
  };

  // Update position on mount and when isOpen changes
  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen]);

  // Update position on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      updatePosition();
    };

    // Listen to scroll on window and all parent scrollable elements
    window.addEventListener("scroll", handleScroll, true);
    
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  // Filter presets based on search query
  const filteredPresets = PRESET_CATEGORIES.filter(preset =>
    preset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if search query exactly matches any preset
  const exactMatch = PRESET_CATEGORIES.some(p => p.name.toLowerCase() === searchQuery.trim().toLowerCase());
  
  // Logic for Create Button
  const showCreateOption = !exactMatch; 

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is inside dropdown
      if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
        return;
      }
      
      // Check if click is inside the trigger button (if ref exists)
      if (activeRef?.current && activeRef.current.contains(event.target as Node)) {
        return;
      }

      onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, activeRef]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleCreateClick = () => {
    if (!searchQuery.trim()) {
      // If empty, pass empty string to signal custom creation to parent
      onSelect("");
    } else {
      // Otherwise, pass the typed name
      onSelect(searchQuery);
    }
    onClose();
    setSearchQuery("");
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Dropdown */}
      <div
        ref={dropdownRef}
        style={{
          position: "fixed",
          top: dropdownPosition.top,
          right: dropdownPosition.right,
          width: "340px",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid #D9E1DE",
          borderRadius: "8px",
          zIndex: 50,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "450px"
        }}
      >
        {/* Search Bar with subtle gray background */}
        <div style={{
          padding: "12px 16px",
          backgroundColor: "#F8F9FA",
          borderBottom: "1px solid #E8EDEF",
          flexShrink: 0
        }}>
          <div style={{
            position: "relative",
            display: "flex",
            alignItems: "center"
          }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                color: "var(--theme-text-muted)"
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or create new category..."
              style={{
                width: "100%",
                padding: "8px 36px 8px 36px",
                fontSize: "13px",
                border: "1px solid #D9E1DE",
                borderRadius: "6px",
                outline: "none",
                backgroundColor: "var(--theme-bg-surface)",
                transition: "all 0.15s ease"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(15, 118, 110, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#D9E1DE";
                e.currentTarget.style.boxShadow = "none";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim() && !exactMatch) {
                    handleCreateClick();
                }
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
                  justifyContent: "center",
                  borderRadius: "4px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <X size={14} style={{ color: "var(--theme-text-muted)" }} />
              </button>
            )}
          </div>
        </div>

        {/* Preset Categories List (Scrollable) */}
        <div style={{
          padding: "8px 0",
          overflowY: "auto",
          flex: 1, 
          minHeight: "100px"
        }}>
          {/* Section Header */}
          <div style={{
            padding: "8px 16px 4px 16px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--theme-text-muted)",
            letterSpacing: "0.05em",
            textTransform: "uppercase"
          }}>
            Preset Categories
          </div>

          {/* Category Options */}
          {filteredPresets.length > 0 ? (
            filteredPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  onSelect(preset.name);
                  onClose();
                  setSearchQuery("");
                }}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  border: "none",
                  backgroundColor: "var(--theme-bg-surface)",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#2C3E38",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#F8F9FA";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                }}
              >
                <span>{preset.name}</span>
              </button>
            ))
          ) : (
            <div style={{
              padding: "24px 16px",
              textAlign: "center",
              color: "var(--theme-text-muted)",
              fontSize: "13px"
            }}>
                No matching presets found.
            </div>
          )}
        </div>

        {/* Fixed Footer for Creation */}
        {showCreateOption && (
            <div style={{
                padding: "12px 16px",
                backgroundColor: "var(--theme-bg-surface)",
                borderTop: "1px solid #E8EDEF",
                flexShrink: 0
            }}>
                <button
                    onClick={handleCreateClick}
                    style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px dashed #0F766E", // Dashed border as per image
                        borderRadius: "8px",
                        backgroundColor: "var(--theme-bg-surface)", // White background for minimal look
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--theme-action-primary-bg)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        justifyContent: "center"
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; // Light green hover
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                    }}
                >
                    <Plus size={16} />
                    {searchQuery.trim() ? (
                        <span>Create "<span style={{ textDecoration: "underline" }}>{searchQuery}</span>"</span>
                    ) : (
                        "Create new category"
                    )}
                </button>
            </div>
        )}
      </div>
    </>
  );
}
