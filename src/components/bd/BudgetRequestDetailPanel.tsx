import { AddRequestForPaymentPanel } from "../accounting/AddRequestForPaymentPanel";
import type { EVoucher } from "../../types/evoucher";

// NEU-020 DD-20 (ruled by Marcus): budget request approval IS the e-voucher
// manager→CEO approval chain. The approve / post-to-ledger machinery that used
// to live here was unreachable legacy (its `showAccountingControls` flag was
// never passed by any render site) and has been deleted; `bd_budget_requests:approve`
// is dashed in the registry. This panel is now a pure read view.

interface BudgetRequestDetailPanelProps {
  request: EVoucher | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser?: { id: string; name: string; email: string; role?: string; department?: string };
  onStatusChange?: () => void;
}

export function BudgetRequestDetailPanel({
  request,
  isOpen,
  onClose,
  onStatusChange,
}: BudgetRequestDetailPanelProps) {
  if (!isOpen || !request) return null;

  return (
    <AddRequestForPaymentPanel
      isOpen={isOpen}
      onClose={onClose}
      mode="view"
      existingData={request}
      context="bd"
      defaultRequestor={request.requestor_name}
      onSuccess={onStatusChange}
    />
  );
}
