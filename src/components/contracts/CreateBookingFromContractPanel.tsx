/**
 * CreateBookingFromContractPanel
 *
 * Wrapper that creates bookings directly from a contract (non-project path).
 * Structural mirror of CreateBookingFromProjectPanel.tsx — same pattern,
 * different source entity.
 *
 * Supports contract-eligible services only:
 *   - Brokerage (Standard)
 *   - Trucking
 *   - Others
 *
 * NOTE: Forwarding and Marine Insurance are NOT eligible for contracts.
 * Filtering is enforced in ContractDetailView's contractServices array.
 *
 * On successful creation:
 *   1. Sets contract_id on the booking
 *   2. Links the booking to the contract via /contracts/:id/link-booking
 *
 * @see /docs/blueprints/CONTRACT_PARITY_BLUEPRINT.md - Phase 3, Task 3.2
 */

import type { QuotationNew, InquiryService } from "../../types/pricing";
import { CreateBrokerageBookingPanel } from "../operations/CreateBrokerageBookingPanel";
import { CreateTruckingBookingPanel } from "../operations/CreateTruckingBookingPanel";
import { CreateOthersBookingPanel } from "../operations/CreateOthersBookingPanel";
import { CreateForwardingBookingPanel } from "../operations/forwarding/CreateForwardingBookingPanel";
import { CreateMarineInsuranceBookingPanel } from "../operations/CreateMarineInsuranceBookingPanel";
import {
  autofillBrokerageFromContract,
  autofillTruckingFromContract,
  autofillOthersFromContract,
  autofillForwardingFromContract,
  autofillMarineInsuranceFromContract,
  linkBookingToContract,
} from "../../utils/contractAutofill";
import { toast } from "../ui/toast-utils";

interface CreateBookingFromContractPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contract: QuotationNew;
  service: InquiryService;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  onBookingCreated: () => void;
}

export function CreateBookingFromContractPanel({
  isOpen,
  onClose,
  contract,
  service,
  currentUser,
  onBookingCreated,
}: CreateBookingFromContractPanelProps) {
  const serviceType = service.service_type;

  // Prepare prefill data based on service type
  const getPrefillData = () => {
    switch (serviceType) {
      case "Brokerage":
        return {
          ...autofillBrokerageFromContract(contract),
          contract_id: contract.id,
        };

      case "Trucking":
        return {
          ...autofillTruckingFromContract(contract),
          contract_id: contract.id,
        };

      case "Others":
        return {
          ...autofillOthersFromContract(contract),
          contract_id: contract.id,
        };

      case "Forwarding":
        return {
          ...autofillForwardingFromContract(contract),
          contract_id: contract.id,
        };

      case "Marine Insurance":
        return {
          ...autofillMarineInsuranceFromContract(contract),
          contract_id: contract.id,
        };

      default:
        return { contract_id: contract.id };
    }
  };

  // Handle successful booking creation — link to contract
  const handleSuccess = async (bookingData: any) => {
    try {
      if (!bookingData || !bookingData.bookingId) {
        console.error("[CreateBookingFromContract] Invalid booking data:", bookingData);
        toast.error(
          "Invalid booking data",
          "Booking created but response data is missing. Please refresh."
        );
        onBookingCreated();
        return;
      }

      // Link the booking to the contract
      console.log(
        `Linking booking ${bookingData.bookingId} to contract ${contract.quote_number}...`
      );

      const linkResult = await linkBookingToContract(
        contract.id,
        bookingData.bookingId,
        bookingData.bookingId,
        serviceType,
        bookingData.status || "Draft"
      );

      if (!linkResult.success) {
        console.warn(
          "Warning: Booking created but linking failed:",
          linkResult.error
        );
        toast.error(
          "Booking created but linking failed",
          "The booking was created but could not be linked to the contract."
        );
      } else {
        console.log(`Successfully linked booking to contract`);
        toast.success(
          `${serviceType} booking created!`,
          `Booking ${bookingData.bookingId} linked to contract ${contract.quote_number}`
        );
      }

      onBookingCreated();
    } catch (error) {
      console.error("[CreateBookingFromContract] Error linking:", error);
      toast.error("Booking created but linking failed", String(error));
      onBookingCreated();
    }
  };

  if (!isOpen) return null;

  const prefillData = getPrefillData();

  switch (serviceType) {
    case "Brokerage":
      return (
        <CreateBrokerageBookingPanel
          isOpen={isOpen}
          onClose={onClose}
          onSuccess={handleSuccess}
          prefillData={prefillData}
          source="pricing"
          customerId={contract.customer_id}
          serviceType="Brokerage"
          currentUser={currentUser as any}
        />
      );

    case "Trucking":
      return (
        <CreateTruckingBookingPanel
          isOpen={isOpen}
          onClose={onClose}
          onSuccess={handleSuccess}
          prefillData={prefillData}
          source="pricing"
          customerId={contract.customer_id}
          serviceType="Trucking"
          currentUser={currentUser as any}
        />
      );

    case "Others":
      return (
        <CreateOthersBookingPanel
          isOpen={isOpen}
          onClose={onClose}
          onSuccess={handleSuccess}
          prefillData={prefillData}
          source="pricing"
          customerId={contract.customer_id}
          serviceType="Others"
          currentUser={currentUser as any}
        />
      );

    case "Forwarding":
      return (
        <CreateForwardingBookingPanel
          isOpen={isOpen}
          onClose={onClose}
          onBookingCreated={handleSuccess}
          prefillData={prefillData}
          source="pricing"
          customerId={contract.customer_id}
          serviceType="Forwarding"
          currentUser={currentUser as any}
        />
      );

    case "Marine Insurance":
      return (
        <CreateMarineInsuranceBookingPanel
          isOpen={isOpen}
          onClose={onClose}
          onSuccess={handleSuccess}
          prefillData={prefillData}
          source="pricing"
          customerId={contract.customer_id}
          serviceType="Marine Insurance"
          currentUser={currentUser as any}
        />
      );

    default:
      console.error(
        `[CreateBookingFromContract] Unsupported service type: ${serviceType}`
      );
      return null;
  }
}
