import { useState, useRef, useEffect } from "react";
import { MoreVertical, Edit, Copy, Download, Trash2, FileText, FolderOpen, Ticket } from "lucide-react";
import type { QuotationNew } from "../../types/pricing";
import { getNormalizedQuotationStatus } from "../../utils/quotationStatus";
import { NeuronModal } from "../ui/NeuronModal";

interface QuotationActionMenuProps {
  quotation: QuotationNew;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onConvertToProject?: () => void;
  onCreateTicket?: () => void;
  canDuplicate?: boolean;
  canDelete?: boolean;
}

export function QuotationActionMenu({ 
  quotation, 
  onEdit, 
  onDuplicate, 
  onDelete,
  onConvertToProject,
  onCreateTicket,
  canDuplicate = true,
  canDelete = true,
}: QuotationActionMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const normalizedStatus = getNormalizedQuotationStatus(quotation);
  const hasDeleteAction = canDelete && (
    normalizedStatus === "Draft"
    || normalizedStatus === "Disapproved"
    || normalizedStatus === "Cancelled"
  );
  const hasConvertAction = !!onConvertToProject && normalizedStatus === "Accepted by Client";
  const hasMenuActions = canDuplicate || hasConvertAction || !!onCreateTicket || hasDeleteAction;

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  const confirmDelete = () => {
    console.log("Deleting quotation:", quotation.quote_number);
    onDelete();
    setShowDeleteModal(false);
    setShowMenu(false);
  };

  if (!hasMenuActions) return null;

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      {/* Actions Button - Kebab Icon Only */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "36px",
          height: "36px",
          padding: 0,
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "8px",
          color: "var(--theme-text-muted)",
          cursor: "pointer",
          transition: "all 0.2s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
          e.currentTarget.style.backgroundColor = "#F8FBFB";
          e.currentTarget.style.color = "var(--theme-action-primary-bg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
          e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
          e.currentTarget.style.color = "var(--theme-text-muted)";
        }}
        title="Actions"
      >
        <MoreVertical size={18} />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "240px",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "8px",
          boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
          zIndex: 100,
          overflow: "hidden"
        }}>
          {/* Duplicate */}
          {canDuplicate && (
            <button
              onClick={() => {
                onDuplicate();
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
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
              <Copy size={16} style={{ color: "var(--theme-text-muted)" }} />
              <span>Duplicate</span>
            </button>
          )}

          {/* Convert to Project - Only visible for "Accepted by Client" */}
          {hasConvertAction && (
            <button
              onClick={() => {
                onConvertToProject();
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "transparent",
                border: "none",
                borderTop: "1px solid var(--theme-border-subtle)",
                cursor: "pointer",
                fontSize: "14px",
                color: "var(--theme-action-primary-bg)",
                textAlign: "left",
                transition: "background-color 0.15s ease",
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-status-success-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <FolderOpen size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
              <span>Convert to Project</span>
            </button>
          )}

          {/* Create Ticket */}
          {onCreateTicket && (
            <button
              onClick={() => {
                onCreateTicket();
                setShowMenu(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "transparent",
                border: "none",
                borderTop: "1px solid var(--theme-border-subtle)",
                cursor: "pointer",
                fontSize: "14px",
                color: "var(--theme-action-primary-bg)",
                textAlign: "left",
                transition: "background-color 0.15s ease",
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-status-success-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Ticket size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
              <span>Create Ticket</span>
            </button>
          )}

          {/* Delete — only available for Draft, Disapproved, or Cancelled quotations */}
          {hasDeleteAction && (
          <button
            onClick={() => {
              setShowMenu(false);
              setShowDeleteModal(true);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              backgroundColor: "transparent",
              border: "none",
              borderTop: "1px solid var(--theme-border-subtle)",
              cursor: "pointer",
              fontSize: "14px",
              color: "var(--theme-status-danger-fg)",
              textAlign: "left",
              transition: "background-color 0.15s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
          )}
        </div>
      )}

      {/* Delete Modal */}
      <NeuronModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Quotation"
        description={`Are you sure you want to delete ${quotation.quote_number || quotation.quotation_name || "this quotation"}? This action is permanent and cannot be undone. All associated history and linked documents will be removed.`}
        confirmLabel="Delete Quotation"
        confirmIcon={<Trash2 size={15} />}
        onConfirm={confirmDelete}
        variant="danger"
      />
    </div>
  );
}
