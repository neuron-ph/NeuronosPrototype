import { useState, useEffect } from "react";
import { X, Loader2, Plus } from "lucide-react";
import { useUser } from "../../../hooks/useUser";
import { logActivity } from "../../../utils/activityLog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../ui/dialog";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { toast } from "../../ui/toast-utils";
import { supabase } from "../../../utils/supabase/client";

interface AddChargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  bookingId?: string;
}

export function AddChargeModal({ isOpen, onClose, onSuccess, projectId, bookingId }: AddChargeModalProps) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    currency: "PHP",
    service_type: "Forwarding", // Default
    charge_type: "revenue", // Default
    category: "Other Charges" // Default
  });

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setFormData({
        description: "",
        amount: "",
        currency: "PHP",
        service_type: "Forwarding",
        charge_type: "revenue",
        category: "Other Charges"
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.description || !formData.amount) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!bookingId) {
      toast.error("Manual charges must be created from a real booking context.");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        project_number: projectId, // API expects project_number
        booking_id: bookingId,
        description: formData.description,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        service_type: formData.service_type,
        type: formData.charge_type, // 'revenue' or 'reimbursement'
        source_type: 'manual',
        quotation_category: formData.category
      };

      const { error: insertError } = await supabase.from('evouchers').insert({
        ...payload,
        transaction_type: 'billing',
        status: 'unbilled',
        created_at: new Date().toISOString(),
      });

      if (!insertError) {
        const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
        logActivity("billing", projectId, formData.description || projectId, "created", actor);
        toast.success("Charge added successfully");
        onSuccess();
        onClose();
      } else {
        toast.error(insertError.message || "Failed to add charge");
      }
    } catch (error) {
      console.error("Error adding charge:", error);
      toast.error("An error occurred while adding the charge");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-[var(--theme-bg-surface)] p-0 overflow-hidden gap-0 border border-[var(--theme-border-default)] shadow-xl sm:rounded-xl">
        <DialogHeader className="px-6 py-5 border-b border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)]">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-[var(--theme-text-primary)]">Add Billing Charge</DialogTitle>
            <button 
              onClick={onClose}
              className="p-1 rounded-md text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] hover:bg-[var(--neuron-pill-inactive-bg)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <DialogDescription className="sr-only">
            Fill in the details to add a new billing charge to the project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-4">
            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[var(--theme-text-secondary)]">Description <span className="text-[var(--theme-status-danger-fg)]">*</span></Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="e.g. Handling Fee"
                className="h-9 text-sm border-[var(--theme-border-default)] focus:border-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[var(--theme-text-secondary)]">Charge Category</Label>
              <Select
                value={formData.category}
                onValueChange={(val) => setFormData({...formData, category: val})}
              >
                <SelectTrigger className="h-9 text-sm border-[var(--theme-border-default)] focus:border-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Origin Charges">Origin Charges</SelectItem>
                  <SelectItem value="Freight Charges">Freight Charges</SelectItem>
                  <SelectItem value="Destination Charges">Destination Charges</SelectItem>
                  <SelectItem value="Customs Clearance Charges">Customs Clearance Charges</SelectItem>
                  <SelectItem value="Delivery Charges">Delivery Charges</SelectItem>
                  <SelectItem value="Other Charges">Other Charges</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[var(--theme-text-secondary)]">Amount <span className="text-[var(--theme-status-danger-fg)]">*</span></Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    placeholder="0.00"
                    className="h-9 text-sm border-[var(--theme-border-default)] focus:border-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)] pl-3"
                  />
                </div>
              </div>

              {/* Currency */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[var(--theme-text-secondary)]">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(val) => setFormData({...formData, currency: val})}
                >
                  <SelectTrigger className="h-9 text-sm border-[var(--theme-border-default)] focus:border-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHP">PHP (Philippine Peso)</SelectItem>
                    <SelectItem value="USD">USD (US Dollar)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    <SelectItem value="CNY">CNY (Chinese Yuan)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Service Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[var(--theme-text-secondary)]">Service Type</Label>
                <Select
                  value={formData.service_type}
                  onValueChange={(val) => setFormData({...formData, service_type: val})}
                >
                  <SelectTrigger className="h-9 text-sm border-[var(--theme-border-default)] focus:border-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Forwarding">Forwarding</SelectItem>
                    <SelectItem value="Brokerage">Brokerage</SelectItem>
                    <SelectItem value="Trucking">Trucking</SelectItem>
                    <SelectItem value="Warehousing">Warehousing</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Charge Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[var(--theme-text-secondary)]">Charge Type</Label>
                <Select
                  value={formData.charge_type}
                  onValueChange={(val) => setFormData({...formData, charge_type: val})}
                >
                  <SelectTrigger className="h-9 text-sm border-[var(--theme-border-default)] focus:border-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Revenue</SelectItem>
                    <SelectItem value="reimbursement">Reimbursement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 text-xs font-medium border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-page)] hover:text-[var(--theme-text-secondary)]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-9 text-xs font-medium bg-[var(--theme-action-primary-bg)] hover:bg-[#0D6259] text-white gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Add Charge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
