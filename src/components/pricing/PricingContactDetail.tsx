import type { Contact, Customer } from "../../types/bd";
import type { QuotationType } from "../../types/pricing";
import { ContactDetail } from "../bd/ContactDetail";

interface PricingContactDetailProps {
  contact: Contact;
  onBack: () => void;
  onCreateInquiry?: (customer: Customer, contact?: Contact, quotationType?: QuotationType) => void;
}

export function PricingContactDetail({ contact, onBack, onCreateInquiry }: PricingContactDetailProps) {
  return (
    <ContactDetail 
      contact={contact} 
      onBack={onBack} 
      onCreateInquiry={onCreateInquiry}
      variant="pricing"
    />
  );
}
