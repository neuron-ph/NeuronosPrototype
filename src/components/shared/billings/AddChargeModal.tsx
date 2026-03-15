import { useState, useEffect } from "react";
import { X, Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../ui/dialog";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { toast } from "../../ui/toast-utils";
import { apiFetch } from "../../../utils/api";

interface AddChargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  bookingId?: string;
}

export function AddChargeModal({ isOpen, onClose, onSuccess, projectId, bookingId }: AddChargeModalProps) {
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

      const response = await apiFetch(`/accounting/billing-items`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success("Charge added successfully");
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || "Failed to add charge");
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
      <DialogContent className="sm:max-w-[500px] bg-white p-0 overflow-hidden gap-0 border border-[#E5E9F0] shadow-xl sm:rounded-xl">
        <DialogHeader className="px-6 py-5 border-b border-[#E5E9F0] bg-white">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-[#12332B]">Add Billing Charge</DialogTitle>
            <button 
              onClick={onClose}
              className="p-1 rounded-md text-[#98A2B3] hover:text-[#475467] hover:bg-[#F2F4F7] transition-colors"
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
              <Label className="text-xs font-medium text-[#344054]">Description <span className="text-red-500">*</span></Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="e.g. Handling Fee"
                className="h-9 text-sm border-[#D0D5DD] focus:border-[#0F766E] focus:ring-[#0F766E]"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#344054]">Charge Category</Label>
              <Select
                value={formData.category}
                onValueChange={(val) => setFormData({...formData, category: val})}
              >
                <SelectTrigger className="h-9 text-sm border-[#D0D5DD] focus:border-[#0F766E] focus:ring-[#0F766E]">
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
                <Label className="text-xs font-medium text-[#344054]">Amount <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    placeholder="0.00"
                    className="h-9 text-sm border-[#D0D5DD] focus:border-[#0F766E] focus:ring-[#0F766E] pl-3"
                  />
                </div>
              </div>

              {/* Currency */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#344054]">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(val) => setFormData({...formData, currency: val})}
                >
                  <SelectTrigger className="h-9 text-sm border-[#D0D5DD] focus:border-[#0F766E] focus:ring-[#0F766E]">
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
                <Label className="text-xs font-medium text-[#344054]">Service Type</Label>
                <Select
                  value={formData.service_type}
                  onValueChange={(val) => setFormData({...formData, service_type: val})}
                >
                  <SelectTrigger className="h-9 text-sm border-[#D0D5DD] focus:border-[#0F766E] focus:ring-[#0F766E]">
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
                <Label className="text-xs font-medium text-[#344054]">Charge Type</Label>
                <Select
                  value={formData.charge_type}
                  onValueChange={(val) => setFormData({...formData, charge_type: val})}
                >
                  <SelectTrigger className="h-9 text-sm border-[#D0D5DD] focus:border-[#0F766E] focus:ring-[#0F766E]">
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
              className="h-9 text-xs font-medium border-[#D0D5DD] text-[#344054] hover:bg-[#F9FAFB] hover:text-[#344054]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-9 text-xs font-medium bg-[#0F766E] hover:bg-[#0D6259] text-white gap-2"
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