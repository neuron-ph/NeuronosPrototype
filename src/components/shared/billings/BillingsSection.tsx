import { Plus, Receipt } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { BillingCategorySection, BillingCategoryItem } from "./BillingCategorySection";
import { CategoryPresetDropdown } from "../../pricing/quotations/CategoryPresetDropdown";
import { getBillingDisplayCategory } from "../../../utils/billingCategory";

interface BillingsSectionProps {
  items: BillingCategoryItem[];
  bookingId?: string;
  projectId?: string;
  onRefresh?: () => void;
  viewMode?: boolean;
}

export function BillingsSection({
  items,
  bookingId,
  projectId,
  onRefresh,
  viewMode = false
}: BillingsSectionProps) {
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const addCategoryButtonRef = useRef<HTMLButtonElement>(null);
  
  // Local state for categories (derived from items + manually added empty categories)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  
  // New state: Hidden categories (deleted by user)
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  
  // New state: Is user currently creating a new custom category?
  const [creatingNewCategory, setCreatingNewCategory] = useState(false);
  const endOfListRef = useRef<HTMLDivElement>(null);

  // Group items by category
  const categoriesMap = items.reduce((acc, item) => {
    const cat = getBillingDisplayCategory(item);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, BillingCategoryItem[]>);
  
  // Combine existing categories from items with extra manually added categories
  // Use Set to dedup and filter out hidden categories
  const allCategoryNames = Array.from(new Set([
    ...Object.keys(categoriesMap),
    ...extraCategories
  ])).filter(c => c !== "Uncategorized" && !hiddenCategories.has(c)); 
  
  // Default expand all categories on first load if we have items
  useEffect(() => {
    if (items.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(Object.keys(categoriesMap)));
    }
  }, [items.length]);

  // Scroll to bottom when creating new category
  useEffect(() => {
    if (creatingNewCategory && endOfListRef.current) {
        endOfListRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [creatingNewCategory]);

  const handleAddCategory = (categoryName: string) => {
    // Check if this is a request to create a custom category (empty string signal)
    if (categoryName === "") {
        setCreatingNewCategory(true);
        return;
    }

    // 0. If it was hidden, unhide it
    if (hiddenCategories.has(categoryName)) {
        const newHidden = new Set(hiddenCategories);
        newHidden.delete(categoryName);
        setHiddenCategories(newHidden);
    }

    // 1. Add to extraCategories if it doesn't exist yet
    if (!allCategoryNames.includes(categoryName)) {
      setExtraCategories(prev => [...prev, categoryName]);
    }

    // 2. ALWAYS expand it, even if it already existed
    setExpandedCategories(prev => new Set(prev).add(categoryName));
  };
  
  const handleSaveNewCategory = (name: string) => {
      // 0. Unhide if hidden
      if (hiddenCategories.has(name)) {
        const newHidden = new Set(hiddenCategories);
        newHidden.delete(name);
        setHiddenCategories(newHidden);
      }

      // 1. Add new name
      if (!allCategoryNames.includes(name)) {
          setExtraCategories(prev => [...prev, name]);
      }
      // 2. Ensure expanded
      setExpandedCategories(prev => new Set(prev).add(name));
      // 3. Close creation mode
      setCreatingNewCategory(false);
  };
  
  const handleDeleteCategory = (categoryName: string) => {
      // Remove from extraCategories (if it was just added manually)
      setExtraCategories(prev => prev.filter(c => c !== categoryName));
      // Add to hidden categories (so it disappears even if it has items)
      setHiddenCategories(prev => new Set(prev).add(categoryName));
  };

  return (
    <div
      style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "12px",
        padding: "28px",
        marginBottom: "24px"
      }}
    >
      {/* Header */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: "24px",
        paddingBottom: "20px",
        borderBottom: "2px solid var(--theme-bg-surface-tint)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Receipt size={18} style={{ color: "var(--neuron-brand-green)" }} />
          <h2 style={{
            fontSize: "17px",
            fontWeight: 600,
            color: "var(--neuron-brand-green)",
            margin: 0,
            letterSpacing: "-0.01em"
          }}>
            Billings
          </h2>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          {/* Collapse All / Expand All */}
          {allCategoryNames.length > 0 && (
            <button
              onClick={() => {
                if (expandedCategories.size === allCategoryNames.length) {
                  // All expanded → Collapse all
                  setExpandedCategories(new Set());
                } else {
                  // Some or none expanded → Expand all
                  setExpandedCategories(new Set(allCategoryNames));
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--theme-text-muted)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
              }}
            >
              {expandedCategories.size === allCategoryNames.length ? "Collapse All" : "Expand All"}
            </button>
          )}

          {/* Add Category Button */}
          {!viewMode && (
          <button
            ref={addCategoryButtonRef}
            onClick={() => setShowPresetDropdown(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--neuron-brand-green)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
              e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              e.currentTarget.style.borderColor = "var(--theme-border-default)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <Plus size={16} />
            Add Category
          </button>
          )}
        </div>
      </div>

      {/* Categories Display */}
      {allCategoryNames.length === 0 && !creatingNewCategory ? (
        <div style={{
          padding: "48px 24px",
          textAlign: "center",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "10px"
        }}>
          <Receipt 
            size={48} 
            strokeWidth={1.2}
            style={{ 
              color: "var(--neuron-ink-muted)",
              margin: "0 auto 12px auto",
              display: "block",
              opacity: 0.75
            }} 
          />
          <h3 style={{ 
            color: "var(--neuron-ink-primary)",
            fontSize: "16px",
            fontWeight: 500,
            marginBottom: "4px"
          }}>
            No billings yet
          </h3>
          <p style={{ 
            color: "var(--neuron-ink-muted)",
            fontSize: "14px",
            margin: 0
          }}>
            Add a category to start adding billing items
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {allCategoryNames.map((categoryName) => {
            const catItems = categoriesMap[categoryName] || [];
            
            return (
                <div key={`${categoryName}-${expandedCategories.has(categoryName)}`}> 
                  <BillingCategorySection 
                    categoryName={categoryName}
                    items={catItems}
                    projectId={projectId}
                    bookingId={bookingId}
                    onRefresh={onRefresh}
                    readOnly={viewMode}
                    viewMode={viewMode}
                    defaultExpanded={expandedCategories.has(categoryName)}
                    onDelete={() => handleDeleteCategory(categoryName)}
                />
               </div>
            );
          })}

          {/* Ghost Component for Creation */}
          {creatingNewCategory && (
              <div ref={endOfListRef}>
                <BillingCategorySection
                    categoryName=""
                    items={[]}
                    projectId={projectId}
                    bookingId={bookingId}
                    onRefresh={onRefresh}
                    readOnly={false}
                    viewMode={false}
                    defaultExpanded={true}
                    isEditing={true}
                    onSaveName={handleSaveNewCategory}
                    onCancel={() => setCreatingNewCategory(false)}
                />
              </div>
          )}
        </div>
      )}
      
      {/* Category Preset Dropdown */}
      <CategoryPresetDropdown
        isOpen={showPresetDropdown}
        buttonRef={addCategoryButtonRef as React.RefObject<HTMLButtonElement>}
        onClose={() => setShowPresetDropdown(false)}
        onSelect={(categoryName) => {
          handleAddCategory(categoryName);
          setShowPresetDropdown(false);
        }}
      />
    </div>
  );
}
