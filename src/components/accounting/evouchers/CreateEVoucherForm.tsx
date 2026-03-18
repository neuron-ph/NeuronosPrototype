import { AddRequestForPaymentPanel } from "../AddRequestForPaymentPanel";

interface CreateEVoucherFormProps {
  isOpen: boolean;
  onClose: () => void;
  context?: "bd" | "accounting" | "operations" | "collection" | "billing";
  defaultRequestor?: string;
  bookingId?: string;
  projectNumber?: string;
  bookingType?: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  onSuccess?: () => void;
}

export function CreateEVoucherForm({
  isOpen,
  onClose,
  context = "accounting",
  defaultRequestor,
  bookingId,
  projectNumber,
  bookingType,
  onSuccess
}: CreateEVoucherFormProps) {
  return (
    <AddRequestForPaymentPanel
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      context={context}
      defaultRequestor={defaultRequestor}
      bookingId={bookingId}
      projectNumber={projectNumber}
      bookingType={bookingType}
      mode="create"
    />
  );
}
