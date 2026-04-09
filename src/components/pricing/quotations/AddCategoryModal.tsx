import { useState } from "react";
import { X, FolderPlus } from "lucide-react";

interface AddCategoryModalProps {
  onClose: () => void;
  onAdd: (name: string) => void;
}

export function AddCategoryModal({ onClose, onAdd }: AddCategoryModalProps) {
  const [categoryName, setCategoryName] = useState("");

  const predefinedCategories = [
    "SEA FREIGHT",
    "AIR FREIGHT",
    "ORIGIN LOCAL CHARGES",
    "DESTINATION LOCAL CHARGES",
    "DESTINATION CHARGES (LCL NON VAT)",
    "DESTINATION CHARGES (LCL WITH 12% VAT)",
    "BROKERAGE CHARGES",
    "TRUCKING CHARGES",
    "INSURANCE CHARGES",
    "OTHER CHARGES"
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (categoryName.trim()) {
      onAdd(categoryName.trim());
      setCategoryName("");
    }
  };

  const handleQuickAdd = (name: string) => {
    onAdd(name);
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      padding: "20px"
    }}>
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        borderRadius: "8px",
        width: "100%",
        maxWidth: "500px",
        maxHeight: "90vh",
        overflow: "auto",
        border: "1px solid var(--neuron-ui-border)"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--neuron-ui-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--theme-bg-page)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FolderPlus size={18} style={{ color: "var(--neuron-brand-green)" }} />
            <h3 style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)"
            }}>
              Add Charge Category
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "var(--neuron-ink-muted)"
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          {/* Custom Name Form */}
          <form onSubmit={handleSubmit}>
            <label style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--neuron-ink-primary)"
            }}>
              Custom Category Name
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Enter category name..."
                autoFocus
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: "14px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  backgroundColor: "var(--theme-bg-surface)"
                }}
              />
              <button
                type="submit"
                disabled={!categoryName.trim()}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "white",
                  backgroundColor: categoryName.trim() ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: categoryName.trim() ? "pointer" : "not-allowed"
                }}
              >
                Add
              </button>
            </div>
          </form>

          {/* Divider */}
          <div style={{
            margin: "20px 0",
            height: "1px",
            backgroundColor: "var(--neuron-ui-border)",
            position: "relative"
          }}>
            <span style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor: "var(--theme-bg-surface)",
              padding: "0 12px",
              fontSize: "11px",
              color: "var(--neuron-ink-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Or choose preset
            </span>
          </div>

          {/* Predefined Categories */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--neuron-ink-primary)"
            }}>
              Quick Add Preset Categories
            </label>
            <div style={{ display: "grid", gap: "8px" }}>
              {predefinedCategories.map(name => (
                <button
                  key={name}
                  onClick={() => handleQuickAdd(name)}
                  style={{
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                    backgroundColor: "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
