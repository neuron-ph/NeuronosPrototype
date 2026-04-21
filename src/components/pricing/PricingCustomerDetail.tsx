import type { Customer } from "../../types/bd";
import type { QuotationType } from "../../types/pricing";
import { CustomerDetail } from "../bd/CustomerDetail";

interface PricingCustomerDetailProps {
  customer: Customer;
  onBack: () => void;
  onCreateInquiry?: (customer: Customer, quotationType?: QuotationType) => void;
  onViewInquiry?: (inquiryId: string) => void;
}

export function PricingCustomerDetail({ customer, onBack, onCreateInquiry, onViewInquiry }: PricingCustomerDetailProps) {
  return (
    <CustomerDetail 
      customer={customer} 
      onBack={onBack} 
      onCreateInquiry={onCreateInquiry}
      onViewInquiry={onViewInquiry}
      variant="pricing"
    />
  );
}
