import { useState } from "react";
import type { Project, InquiryService } from "../../types/pricing";
import { CreateBrokerageBookingPanel } from "../operations/CreateBrokerageBookingPanel";
import { CreateForwardingBookingPanel } from "../operations/forwarding/CreateForwardingBookingPanel";
import { CreateTruckingBookingPanel } from "../operations/CreateTruckingBookingPanel";
import { CreateMarineInsuranceBookingPanel } from "../operations/CreateMarineInsuranceBookingPanel";
import { CreateOthersBookingPanel } from "../operations/CreateOthersBookingPanel";
import { 
  autofillForwardingFromProject,
  autofillBrokerageFromProject,
  autofillTruckingFromProject,
  autofillMarineInsuranceFromProject,
  autofillOthersFromProject,
  linkBookingToProject
} from "../../utils/projectAutofill";
import { toast } from "../ui/toast-utils";
import { supabase } from "../../utils/supabase/client";

interface CreateBookingFromProjectPanelProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  service: InquiryService;
  currentUser?: { 
    id: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  onBookingCreated: () => void;
}

export function CreateBookingFromProjectPanel({
  isOpen,
  onClose,
  project,
  service,
  currentUser,
  onBookingCreated
}: CreateBookingFromProjectPanelProps) {
  
  // Get the service type
  const serviceType = service.service_type;
  
  // Prepare prefill data based on service type
  const getPrefillData = () => {
    switch (serviceType) {
      case "Forwarding":
        return {
          ...autofillForwardingFromProject(project),
          accountOwner: currentUser?.name || "",
          accountHandler: currentUser?.name || "",
          projectNumber: project.project_number,
        };
      
      case "Brokerage":
        return {
          ...autofillBrokerageFromProject(project),
          accountOwner: currentUser?.name || "",
          accountHandler: currentUser?.name || "",
          projectNumber: project.project_number,
          brokerageType: (service.service_details as any)?.subtype || "Standard",
        };
      
      case "Trucking":
        return {
          ...autofillTruckingFromProject(project),
          accountOwner: currentUser?.name || "",
          accountHandler: currentUser?.name || "",
          projectNumber: project.project_number,
        };
      
      case "Marine Insurance":
        return {
          ...autofillMarineInsuranceFromProject(project),
          accountOwner: currentUser?.name || "",
          accountHandler: currentUser?.name || "",
          projectNumber: project.project_number,
        };
      
      case "Others":
        return {
          ...autofillOthersFromProject(project),
          accountOwner: currentUser?.name || "",
          accountHandler: currentUser?.name || "",
          projectNumber: project.project_number,
        };
      
      default:
        return {};
    }
  };

  // Handle successful booking creation
  const handleSuccess = async (bookingData: any) => {
    try {
      // Validate booking data
      if (!bookingData || !bookingData.id) {
        console.error("Invalid booking data received:", bookingData);
        toast.error(
          "Invalid booking data",
          "The booking was created but the response data is missing or invalid. Please refresh the page."
        );
        onBookingCreated();
        return;
      }

      const bookingRef = bookingData.booking_number || bookingData.id;

      // Link the booking to the project
      console.log(`Linking booking ${bookingRef} to project ${project.project_number}...`);

      const linkResult = await linkBookingToProject(
        project.id,
        bookingData.id,
        bookingRef,
        serviceType,
        bookingData.status || "Draft",
      );

      if (!linkResult.success) {
        console.warn("Warning: Booking created but linking failed:", linkResult.error);
        toast.error(
          "Booking created but linking failed",
          "The booking was created successfully but could not be linked to the project. Please link it manually."
        );
      } else {
        console.log(`✓ Successfully linked booking to project`);

        // Auto-link billing_line_items for this service type that have no booking yet
        const { error: billingLinkError } = await supabase
          .from('billing_line_items')
          .update({ booking_id: bookingData.id })
          .eq('project_number', project.project_number)
          .eq('service_type', serviceType)
          .is('booking_id', null);

        if (billingLinkError) {
          console.warn("Warning: Could not auto-link billing items to booking:", billingLinkError.message);
        } else {
          console.log(`✓ Auto-linked billing items for ${serviceType} → ${bookingData.id}`);
        }

        toast.success(
          `${serviceType} booking created!`,
          `Booking ${bookingRef} has been created and linked to project ${project.project_number}`
        );
      }

      onBookingCreated();
    } catch (error) {
      console.error("Error linking booking to project:", error);
      toast.error("Booking created but linking failed", String(error));
      onBookingCreated(); // Still call this to refresh the list
    }
  };

  // Render the appropriate panel based on service type
  if (!isOpen) return null;

  const prefillData = getPrefillData();

  switch (serviceType) {
    case "Forwarding":
      return (
        <CreateForwardingBookingPanel
          isOpen={isOpen}
          onClose={onClose}
          onBookingCreated={handleSuccess}
          prefillData={prefillData}
          source="pricing"
          customerId={project.customer_id}
          serviceType="Forwarding"
          currentUser={currentUser as any}
        />
      );

    case "Brokerage":
      return (
        <CreateBrokerageBookingPanel
          isOpen={isOpen}
          onClose={onClose}
          onSuccess={handleSuccess}
          prefillData={prefillData}
          source="pricing"
          customerId={project.customer_id}
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
          customerId={project.customer_id}
          serviceType="Trucking"
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
          customerId={project.customer_id}
          serviceType="Marine Insurance"
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
          customerId={project.customer_id}
          serviceType="Others"
          currentUser={currentUser as any}
        />
      );

    default:
      console.error(`Unsupported service type: ${serviceType}`);
      return null;
  }
}