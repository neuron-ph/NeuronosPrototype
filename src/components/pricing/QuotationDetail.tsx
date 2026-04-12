import { ArrowLeft } from "lucide-react";
import type { QuotationNew } from "../../types/pricing";
import { QuotationFileView } from "./QuotationFileView";

interface QuotationDetailProps {
  quotation: QuotationNew;
  onBack: () => void;
  onEdit: () => void;
  userDepartment?: "Business Development" | "Pricing";
  onAcceptQuotation?: (quotation: QuotationNew) => void;
  onUpdate?: (quotation: QuotationNew) => void;
  onSaveQuotation?: (quotation: QuotationNew) => Promise<void>;
  onDuplicate?: (quotation: QuotationNew) => void;
  onDelete?: () => void;
  onCreateTicket?: (quotation: QuotationNew) => void;
  onConvertToProject?: (projectId: string) => void;
  onConvertToContract?: (quotationId: string) => void;
  currentUser?: { id: string; name: string; email: string; department: string; role?: string } | null;
}

export function QuotationDetail({ quotation, onBack, onEdit, userDepartment, onAcceptQuotation, onUpdate, onSaveQuotation, onDuplicate, onDelete, onCreateTicket, onConvertToProject, onConvertToContract, currentUser }: QuotationDetailProps) {
  const handleUpdate = (updatedQuotation: QuotationNew) => {
    if (onUpdate) {
      onUpdate(updatedQuotation);
    }
  };

  return (
    <QuotationFileView 
      quotation={quotation} 
      onBack={onBack} 
      onEdit={onEdit} 
      userDepartment={userDepartment} 
      onAcceptQuotation={onAcceptQuotation}
      onUpdate={handleUpdate}
      onSaveQuotation={onSaveQuotation}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onCreateTicket={onCreateTicket}
      onConvertToProject={onConvertToProject}
      onConvertToContract={onConvertToContract}
      currentUser={currentUser}
    />
  );
}
