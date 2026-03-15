import { useState } from "react";
import { QuotationNew } from "../../types/pricing";
import { X } from "lucide-react";
import { apiFetch } from '../../utils/api';
import { toast } from "../ui/toast-utils";

interface CreateProjectModalProps {
  quotation: QuotationNew;
  onClose: () => void;
  onSuccess: (projectId: string) => void;
  currentUser?: { id: string; name: string; email: string; department: string } | null;
}

export function CreateProjectModal({ quotation, onClose, onSuccess, currentUser }: CreateProjectModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    client_po_number: "",
    shipment_ready_date: "",
    requested_etd: "",
    special_instructions: "",
    ops_assigned_user_name: ""
  });

  const handleCreate = async () => {
    // Validate required fields
    if (!formData.client_po_number.trim()) {
      toast.error("Client PO Number is required");
      return;
    }
    if (!formData.shipment_ready_date) {
      toast.error("Shipment Ready Date is required");
      return;
    }
    if (!formData.requested_etd) {
      toast.error("Requested ETD is required");
      return;
    }

    setIsCreating(true);
    try {
      const response = await apiFetch(`/projects`, {
        method: 'POST',
        body: JSON.stringify({
          quotation_id: quotation.id,
          ...formData,
          ops_assigned_user_id: formData.ops_assigned_user_name ? "user-ops-rep-001" : null,
          bd_owner_user_id: currentUser?.id,
          bd_owner_user_name: currentUser?.name
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Project created successfully!");
        onSuccess(result.data.id);
      } else {
        toast.error("Error creating project", result.error);
      }
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error("Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-6" style={{ borderColor: "var(--neuron-border)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl text-[var(--neuron-deep-green)] mb-1">Create Project</h2>
              <p className="text-sm text-gray-600">From Quotation: {quotation.quote_number}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Quotation Summary */}
          <div className="bg-gray-50 border rounded-lg p-4" style={{ borderColor: "var(--neuron-border)" }}>
            <div className="text-sm text-gray-500 mb-2">Quotation Summary</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Customer:</span>
                <span className="ml-2 text-gray-900">{quotation.customer_name}</span>
              </div>
              <div>
                <span className="text-gray-600">Total:</span>
                <span className="ml-2 text-gray-900">
                  {quotation.currency} {quotation.financial_summary?.grand_total.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Route:</span>
                <span className="ml-2 text-gray-900">
                  {quotation.pol_aol} → {quotation.pod_aod}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Services:</span>
                <span className="ml-2 text-gray-900">{quotation.services?.join(", ")}</span>
              </div>
            </div>
          </div>

          {/* Project Details Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Client PO Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.client_po_number}
                onChange={(e) => setFormData({ ...formData, client_po_number: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                style={{ borderColor: "var(--neuron-border)" }}
                placeholder="Enter client's purchase order number"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Shipment Ready Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.shipment_ready_date}
                  onChange={(e) => setFormData({ ...formData, shipment_ready_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ borderColor: "var(--neuron-border)" }}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Requested ETD <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.requested_etd}
                  onChange={(e) => setFormData({ ...formData, requested_etd: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ borderColor: "var(--neuron-border)" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Assign to Operations (Optional)
              </label>
              <input
                type="text"
                value={formData.ops_assigned_user_name}
                onChange={(e) => setFormData({ ...formData, ops_assigned_user_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                style={{ borderColor: "var(--neuron-border)" }}
                placeholder="Enter operations team member name"
              />
              <p className="text-xs text-gray-500 mt-1">
                You can assign this later if not decided yet
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Special Instructions (Optional)
              </label>
              <textarea
                value={formData.special_instructions}
                onChange={(e) => setFormData({ ...formData, special_instructions: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border rounded-lg"
                style={{ borderColor: "var(--neuron-border)" }}
                placeholder="Temperature requirements, handling instructions, delivery notes, etc."
              />
            </div>
          </div>

          {/* Info Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              After creating the project, you'll need to complete the handover checklist before transferring to Operations.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t p-6 flex justify-end gap-3" style={{ borderColor: "var(--neuron-border)" }}>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-6 py-2 border rounded-lg hover:border-gray-400 transition-colors"
            style={{ borderColor: "var(--neuron-border)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="px-6 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--neuron-teal-green)" }}
          >
            {isCreating ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}