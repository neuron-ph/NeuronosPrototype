/**
 * 📋 QUOTATION BUILDER V3 - DUAL-PRICING SYSTEM WITH CATEGORY MERGE
 * 
 * **Overview:**
 * This component implements a sophisticated dual-pricing quotation system for freight forwarding:
 * - **Buying Price**: Internal vendor costs (per-vendor categories, hidden from customer)
 * - **Selling Price**: Customer-facing prices (merged categories, markup applied)
 * 
 * **Core Features:**
 * 1. 🔀 **Category Merge System**: Auto-merges categories by name in Selling Price
 *    - Multiple vendors with "Origin Charges" → Single "Origin Charges" category
 *    - Case-insensitive matching, automatic consolidation
 * 
 * 2. 🔄 **Auto-Sync**: Buying Price changes auto-update Selling Price
 *    - Line item ID matching (supports merged categories)
 *    - Preserves user-defined markups during sync
 *    - O(1) lookup performance with Map structure
 * 
 * 3. 💰 **Markup System**: Per-line-item profit margins
 *    - Linked Amount/Percentage fields (auto-calculate each other)
 *    - Base cost + markup = final price
 *    - Independent markup per item in merged categories
 * 
 * 4. 🔒 **Vendor Visibility**: Vendor info internal-only
 *    - Buying Price: Shows vendor names, badges, service tags
 *    - Selling Price: NO vendor info (vendor_id stored internally only)
 *    - Clean customer-facing view
 * 
 * **Data Flow:**
 * ```
 * Vendor Import → Buying Price (separate per vendor)
 *                      ↓
 *            convertBuyingToSelling() (0% markup)
 *                      ↓
 *            mergeSellingPriceCategories() (consolidate by name)
 *                      ↓
 *            Selling Price (merged, customer-facing)
 *                      ↓
 *            useEffect sync (auto-update on buying changes)
 * ```
 * 
 * **Key Functions:**
 * - `handleImportVendorCharges()` - Entry point for vendor imports
 * - `mergeSellingPriceCategories()` - Core merge algorithm
 * - `convertBuyingToSelling()` - Buying → Selling conversion
 * - `useEffect` (lines 594-670) - Auto-sync mechanism
 * 
 * **Implementation Blueprint:** See /IMPLEMENTATION_BLUEPRINT.md for full design
 * **Testing Report:** See /TESTING_VALIDATION_REPORT.md for validation results
 * 
 * @component QuotationBuilderV3
 * @version 3.0.0
 * @since 2026-01-24 - Category Merge System completed
 */

import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../utils/supabase/client";
import { queryKeys } from "../../../lib/queryKeys";
import { toast } from "sonner@2.0.3";
import { X, Save, FileText, Handshake } from "lucide-react";
import { GeneralDetailsSection } from "./GeneralDetailsSection";
import { ContractGeneralDetailsSection } from "./ContractGeneralDetailsSection";
import { BrokerageServiceForm } from "./BrokerageServiceForm";
import { ForwardingServiceForm } from "./ForwardingServiceForm";
import { TruckingServiceForm } from "./TruckingServiceForm";
import { VendorsSection } from "./VendorsSection";
import { MarineInsuranceServiceForm } from "./MarineInsuranceServiceForm";
import { OthersServiceForm } from "./OthersServiceForm";
import { ChargeCategoriesManager } from "../shared/ChargeCategoriesManager";
import { BuyingPriceSectionV2 as BuyingPriceSection } from "./BuyingPriceSectionV2";
import { SellingPriceSection } from "./SellingPriceSection";
import { FinancialSummaryPanel } from "./FinancialSummaryPanel";
import type { QuotationNew, QuotationChargeCategory, QuotationLineItemNew, InquiryService, QuotationStatus, BuyingPriceCategory, SellingPriceCategory, SellingPriceLineItem, Vendor, VendorType, ServiceType } from "../../../types/pricing";
import type { VendorLineItem } from "../../../data/networkPartners"; // ⚠️ DEPRECATED - kept for backward compatibility
import { calculateFinancialSummary, generateLineItemId, generateCategoryId } from "../../../utils/quotationCalculations";
import { ContractRateCardV2 as ContractRateMatrixEditor, createEmptyMatrixV2 as createEmptyMatrix } from "./ContractRateCardV2";
import type { ContractRateMatrix, QuotationType, ContractSummary } from "../../../types/pricing";
import { findContractForCustomerService, fetchFullContract } from "../../../utils/contractLookup";
import { contractRatesToSellingPrice, getContractModeColumns, multiLineRatesToSellingPrice } from "../../../utils/contractRateEngine";
import { extractForRateBridge, extractQuantitiesFromTruckingForm, extractQuantitiesFromOthersForm, resolveModeFromForm, extractTruckingSelections, normalizeTruckingLineItems, extractMultiLineSelectionsAndQuantities, extractContractDestinations } from "../../../utils/contractQuantityExtractor";
import type { TruckingLineItem } from "../../../types/pricing";
import { QuotationRateBreakdownSheet } from "./QuotationRateBreakdownSheet";
import type { BookingQuantities } from "../../../utils/contractRateEngine";
import { ContractRateToolbar } from "./ContractRateToolbar";
import { normalizeQuotationStatus } from "../../../utils/quotationStatus";
import { calculateSellingItemFromBuyingPrice } from "../../../utils/pricing/quotationSignedPricing";

interface ContainerEntry {
  id: string;
  type: "20ft" | "40ft" | "45ft" | "";
  qty: number;
}

interface BrokerageFormData {
  brokerageType: "Standard" | "All-Inclusive" | "Non-Regular" | "";
  typeOfEntry?: string;
  consumption?: boolean;
  warehousing?: boolean;
  peza?: boolean;
  pod?: string;
  pods?: string[]; // ✨ CONTRACT: Multiple ports for contract mode
  mode?: string;
  cargoType?: string;
  commodityDescription?: string;
  deliveryAddress?: string;
  // Changed: Now using containers array instead of individual fields
  containers?: ContainerEntry[];
  // Legacy fields for backward compatibility
  fcl20ft?: number;
  fcl40ft?: number;
  fcl45ft?: number;
  fclQty?: number;
  lclGwt?: string;
  lclDims?: string;
  airGwt?: string;
  airCwt?: string;
  countryOfOrigin?: string;
  preferentialTreatment?: string;
  shipmentType?: string; // Add shipmentType field
  declaredValue?: number;
  psic?: string;
  aeo?: string;
  
  // Export specific fields
  bookingConfirmation?: string;
  lct?: string;
  vgm?: string;
  tareWeight?: string; // FCL Only
  sealNumber?: string; // FCL Only
}

interface ForwardingFormData {
  incoterms?: string;
  cargoType?: string;
  commodity?: string;
  commodityDescription?: string;
  deliveryAddress?: string;
  aodPod?: string;
  mode?: string;
  aolPol?: string;
  cargoNature?: string;
  // Changed: Now using containers array instead of individual fields
  containers?: ContainerEntry[];
  // Legacy fields for backward compatibility
  fcl20ft?: number;
  fcl40ft?: number;
  fcl45ft?: number;
  fclQty?: number;
  lclGwt?: string;
  lclDims?: string;
  airGwt?: string;
  airCwt?: string;
  collectionAddress?: string;
  carrierAirline?: string;
  transitTime?: string;
  route?: string;
  stackable?: boolean;
  // Cross-service fields that may also be in Brokerage
  countryOfOrigin?: string;
  preferentialTreatment?: string;
  aol?: string;
  pol?: string;
  aod?: string;
  pod?: string;
  
  // Export specific fields
  bookingReference?: string;
  lct?: string;
  vgm?: string;
}

interface TruckingFormData {
  pullOut?: string;
  deliveryAddress?: string;   // Legacy — derived from first line item
  truckType?: string;         // Legacy — derived from first line item
  qty?: number;               // Legacy — derived from first line item
  deliveryInstructions?: string;
  aolPol?: string; // Export: location to drop off container
  truckingLineItems?: TruckingLineItem[]; // ✨ Multi-line trucking (@see MULTI_LINE_TRUCKING_BLUEPRINT.md)
  
  // Export specific fields
  shipper?: string;
  driverName?: string;
  helperName?: string;
  vehicleRef?: string;
  withGps?: boolean;
  gateIn?: string;
  cyFee?: boolean;
}

interface MarineInsuranceFormData {
  commodityDescription?: string;
  hsCode?: string;
  aolPol?: string;
  aodPod?: string;
  invoiceValue?: number;
  aol?: string;
  pol?: string;
  aod?: string;
  pod?: string;
}

interface OthersFormData {
  serviceDescription?: string;
}

interface QuotationBuilderV3Props {
  onClose: () => void;
  onSave: (quotation: QuotationNew) => void;
  initialData?: Partial<QuotationNew>;
  mode?: "create" | "edit";
  customerData?: any;
  contactData?: any; // Add contact data prop
  builderMode?: "inquiry" | "quotation"; // New prop: inquiry mode hides pricing, quotation mode shows everything
  viewMode?: boolean; // New prop: when true, renders in read-only display mode
  hideHeader?: boolean; // New prop: when true, hides the header with action buttons
  isAmendment?: boolean; // New prop: when true, adjusts buttons for amendment workflow (only "Save Changes")
  onAmend?: () => void; // New prop: Handler for amendment in view mode
  initialQuotationType?: QuotationType; // New prop: pre-set quotation type from external selection
}

export function QuotationBuilderV3({ onClose, onSave, initialData, mode = "create", customerData, contactData, builderMode = "quotation", viewMode = false, hideHeader = false, isAmendment = false, onAmend, initialQuotationType }: QuotationBuilderV3Props) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  // Check if quotation is locked (converted to project)
  const isLocked = mode === "edit" && !!initialData?.project_id;
  
  // Generate quotation number (CQ prefix for contracts, QUO prefix for projects)
  const generateQuoteNumber = (type?: QuotationType) => {
    const year = new Date().getFullYear().toString().slice(-2);
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const day = String(new Date().getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const prefix = type === "contract" ? "CQ" : "QUO";
    return `${prefix}${year}${month}${day}${random}`;
  };

  const [quoteNumber, setQuoteNumber] = useState(initialData?.quote_number || generateQuoteNumber(initialData?.quotation_type));

  // General Details State - Auto-fill from customerData and contactData
  const [customerId, setCustomerId] = useState(
    initialData?.customer_id || 
    customerData?.id || 
    contactData?.customer_id || 
    ""
  );
  const [customerName, setCustomerName] = useState(
    initialData?.customer_name || 
    customerData?.company_name || 
    customerData?.name || 
    ""
  );
  const [contactPersonId, setContactPersonId] = useState(
    initialData?.contact_person_id || 
    contactData?.id || 
    ""
  );
  const [contactPersonName, setContactPersonName] = useState(
    initialData?.contact_person_name ||
    initialData?.contact_name ||
    contactData?.name ||
    (contactData?.first_name && contactData?.last_name
      ? `${contactData.first_name} ${contactData.last_name}`.trim()
      : "") ||
    ""
  );
  const [quotationName, setQuotationName] = useState(initialData?.quotation_name || "");
  const [selectedServices, setSelectedServices] = useState<string[]>(initialData?.services || []);
  // Always strip the time portion — Supabase returns full ISO timestamps but <input type="date"> requires yyyy-MM-dd
  const [date, setDate] = useState(() => {
    const raw = initialData?.quotation_date || initialData?.created_date || "";
    return raw ? raw.split('T')[0] : new Date().toISOString().split('T')[0];
  });
  const [creditTerms, setCreditTerms] = useState(initialData?.credit_terms || "");
  // Parse numeric days from stored string — handles legacy "30 days" and plain "30"
  const [validity, setValidity] = useState(() => {
    const raw = initialData?.validity_period || "";
    const n = parseInt(raw, 10);
    return isNaN(n) ? "" : String(n);
  });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  // ✨ NEW: Movement State (Import/Export)
  const [movement, setMovement] = useState<"IMPORT" | "EXPORT">((initialData?.movement as "IMPORT" | "EXPORT") || "IMPORT");

  // ✨ CONTRACT: Quotation type and contract-specific state
  const [quotationType, setQuotationType] = useState<QuotationType>(initialData?.quotation_type || initialQuotationType || "project");
  const [contractValidityStart, setContractValidityStart] = useState(initialData?.contract_validity_start || "");
  const [contractValidityEnd, setContractValidityEnd] = useState(initialData?.contract_validity_end || "");
  const [rateMatrices, setRateMatrices] = useState<ContractRateMatrix[]>(initialData?.rate_matrices || []);
  const [scopeOfServices, setScopeOfServices] = useState<string>(
    initialData?.scope_of_services?.join("\n") || ""
  );
  const [termsAndConditions, setTermsAndConditions] = useState<string>(
    initialData?.terms_and_conditions?.join("\n") || ""
  );
  const [contractGeneralDetails, setContractGeneralDetails] = useState({
    port_of_entry: initialData?.contract_general_details?.port_of_entry || [] as string[],
    transportation: initialData?.contract_general_details?.transportation || [] as string[],
    type_of_entry: initialData?.contract_general_details?.type_of_entry || "",
    releasing: initialData?.contract_general_details?.releasing || "",
  });
  const isContractMode = quotationType === "contract";
  const [contractValidationAttempted, setContractValidationAttempted] = useState(false);

  // ✨ CONTRACT RATE BRIDGE: Generalized state for ALL contract-covered services
  const [detectedContract, setDetectedContract] = useState<ContractSummary | null>(null);
  const [contractBridgeLoading, setContractBridgeLoading] = useState(false);
  // ✨ GENERALIZED: Per-service tracking maps (replaces single-service boolean)
  const [contractRatesAppliedMap, setContractRatesAppliedMap] = useState<Record<string, boolean>>({});
  const [sourceContractId, setSourceContractId] = useState(initialData?.source_contract_id || "");
  const [sourceContractNumber, setSourceContractNumber] = useState(initialData?.source_contract_number || "");
  // ✨ RATE AUTOMATION: Cached full contract for recalculation without re-fetching
  const [cachedFullContract, setCachedFullContract] = useState<QuotationNew | null>(null);
  // ✨ GENERALIZED: Per-service rate bridge info map
  const [rateBridgeInfoMap, setRateBridgeInfoMap] = useState<Record<string, {
    resolvedMode: string | null;
    totalContainers: number;
    estimatedTotal: number;
  }>>({});

  // ✨ GENERALIZED: Backward-compatible derived values (used by banner until Phase 4 updates it)
  const contractRatesApplied = Object.values(contractRatesAppliedMap).some(v => v);
  const rateBridgeInfo = rateBridgeInfoMap["Brokerage"] || { resolvedMode: null, totalContainers: 0, estimatedTotal: 0 };

  // ✨ Rate Breakdown Sheet: which service's breakdown is currently open (null = closed)
  const [breakdownService, setBreakdownService] = useState<string | null>(null);

  // ✨ Rate Breakdown Sheet: derive current selections for a given service's alternative rows
  const getSelectionsForService = (service: string): Record<string, string> | undefined => {
    const sLower = service.toLowerCase();
    if (sLower === "trucking" && cachedFullContract?.rate_matrices) {
      // ✨ Multi-line: merge all line items' selections for breakdown display
      const lineItems = normalizeTruckingLineItems(truckingData);
      const extractions = extractMultiLineSelectionsAndQuantities(lineItems, cachedFullContract.rate_matrices);
      if (extractions.length > 0) {
        // Merge all selections into one map (for breakdown sheet compatibility)
        const merged: Record<string, string> = {};
        for (const ext of extractions) {
          if (ext.selections) Object.assign(merged, ext.selections);
        }
        return Object.keys(merged).length > 0 ? merged : undefined;
      }
      return extractTruckingSelections(truckingData, cachedFullContract.rate_matrices);
    }
    return undefined; // Brokerage/Others: no selections (all additive)
  };

  // ✨ Rate Breakdown Sheet: derive current quantities for a given service from form data
  const getQuantitiesForService = (service: string): BookingQuantities => {
    const sLower = service.toLowerCase();
    if (sLower === "brokerage" && cachedFullContract?.rate_matrices) {
      const modeColumns = getContractModeColumns(cachedFullContract.rate_matrices, "Brokerage");
      const bridgeResult = extractForRateBridge(brokerageData, modeColumns, brokerageData.mode, undefined);
      return bridgeResult.quantities || { containers: 0, bls: 1, sets: 1 };
    } else if (sLower === "trucking") {
      // ✨ Multi-line: sum all line items' quantities for breakdown sheet
      const lineItems = normalizeTruckingLineItems(truckingData);
      const totalQty = lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);
      return { containers: totalQty || 1, shipments: 1, bls: 1, sets: 1 };
    } else if (sLower === "others") {
      return extractQuantitiesFromOthersForm();
    }
    return { containers: 1, bls: 1, sets: 1 };
  };

  // ✨ CONTRACT: Regenerate quote number when quotation type changes (only in create mode)
  useEffect(() => {
    if (mode === "create" && !initialData?.quote_number) {
      setQuoteNumber(generateQuoteNumber(quotationType));
    }
  }, [quotationType]);

  // ✨ CONTRACT: Auto-set brokerage defaults when switching to contract mode
  useEffect(() => {
    if (isContractMode) {
      // Brokerage in contracts is always Standard type, Multi-Modal mode
      setBrokerageData(prev => ({
        ...prev,
        brokerageType: "Standard",
        mode: "Multi-modal",
      }));
      
      // Strip non-contract services from selection
      const contractEligible = ["Brokerage", "Trucking", "Others"];
      setSelectedServices(prev => {
        const filtered = prev.filter(s => contractEligible.includes(s));
        // Only update if something was actually filtered out
        return filtered.length !== prev.length ? filtered : prev;
      });
    }
  }, [isContractMode]);

  // ✨ NEW: Initial Data Sync for View Mode
  // When running in view mode (e.g., QuotationFormView), we need to ensure the state
  // stays in sync with initialData prop updates, since the component instance persists.
  //
  // ⚠️  IMPORTANT: Depend on stable DB identifiers (id + updated_at), NOT the initialData
  // object reference. QuotationFormView constructs initialData inline, so the reference
  // changes on every parent re-render even when the data is identical. Using the full object
  // as a dep would reset the user's unsaved edits (selling price, categories, line items)
  // on every re-render. The key-based remount in QuotationFormView already handles post-save
  // refresh; this effect only needs to fire when the DB record actually changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (viewMode && initialData) {
      console.log("🔄 QuotationBuilderV3: Syncing state with new initialData (View Mode)");
      
      if (initialData.customer_name) setCustomerName(initialData.customer_name);
      if (initialData.contact_person_name || initialData.contact_name) setContactPersonName(initialData.contact_person_name || initialData.contact_name || "");
      if (initialData.movement) setMovement(initialData.movement as "IMPORT" | "EXPORT");
      if (initialData.services) setSelectedServices(initialData.services);
      if (initialData.buying_price) setBuyingPrice(initialData.buying_price);
      if (initialData.selling_price) setSellingPrice(initialData.selling_price);
      if (initialData.services_metadata) {
        setBrokerageData(loadServiceData("Brokerage", { brokerageType: "" }));
        setForwardingData(loadServiceData("Forwarding", {}));
        setTruckingData(loadServiceData("Trucking", {}));
        setMarineInsuranceData(loadServiceData("Marine Insurance", {}));
        setOthersData(loadServiceData("Others", {}));
      }
      if (initialData.contract_general_details) {
        setContractGeneralDetails({
          port_of_entry: initialData.contract_general_details.port_of_entry || [],
          transportation: initialData.contract_general_details.transportation || [],
          type_of_entry: initialData.contract_general_details.type_of_entry || "",
          releasing: initialData.contract_general_details.releasing || "",
        });
      }
    }
  // Depend on stable DB fields, not the object reference — see comment above.
  }, [viewMode, initialData?.id, initialData?.updated_at]);

  // When Marine Insurance is added AFTER Forwarding is already filled, carry over the route fields
  const prevSelectedServicesRef = useRef<string[]>(selectedServices);
  useEffect(() => {
    const prev = prevSelectedServicesRef.current;
    const marineJustAdded = selectedServices.includes("Marine Insurance") && !prev.includes("Marine Insurance");
    if (marineJustAdded) {
      setMarineInsuranceData(cur => ({
        ...cur,
        ...(!cur.aolPol && forwardingData.aolPol ? { aolPol: forwardingData.aolPol } : {}),
        ...(!cur.aodPod && forwardingData.aodPod ? { aodPod: forwardingData.aodPod } : {}),
        ...(!cur.commodityDescription && forwardingData.commodityDescription ? { commodityDescription: forwardingData.commodityDescription } : {}),
      }));
    }
    prevSelectedServicesRef.current = selectedServices;
  }, [selectedServices]);

  // ✨ CONTRACT: Auto-manage rate matrices when services change
  useEffect(() => {
    if (!isContractMode) return;
    
    // Ensure each selected service has a rate matrix
    const updatedMatrices = [...rateMatrices];
    let changed = false;
    
    // Add missing matrices for newly selected services
    selectedServices.forEach(service => {
      const exists = updatedMatrices.some(m => m.service_type === service as ServiceType);
      if (!exists) {
        updatedMatrices.push(createEmptyMatrix(service as ServiceType));
        changed = true;
      }
    });
    
    // Remove matrices for deselected services
    const filtered = updatedMatrices.filter(m => selectedServices.includes(m.service_type));
    if (filtered.length !== updatedMatrices.length) changed = true;
    
    if (changed) {
      setRateMatrices(filtered.length !== updatedMatrices.length ? filtered : updatedMatrices);
    }
  }, [selectedServices, isContractMode]);

  // Load service-specific form data from initialData.services_metadata
  const loadServiceData = <T extends Record<string, any>>(serviceType: string, defaultData: T): T => {
    const serviceMetadata = initialData?.services_metadata?.find(s => s.service_type === serviceType);
    if (!serviceMetadata) return defaultData;
    
    const details = serviceMetadata.service_details as any;
    
    // Handle backward compatibility: map snake_case (correct) to camelCase (form data)
    // This allows old data with camelCase AND new data with snake_case to load correctly
    if (serviceType === "Brokerage") {
      return {
        ...defaultData,
        brokerageType: details.subtype || details.brokerageType || "",
        shipmentType: details.shipment_type || details.shipmentType,
        typeOfEntry: details.type_of_entry || details.typeOfEntry,
        consumption: details.consumption,
        warehousing: details.warehousing,
        peza: details.peza,
        pod: details.pod,
        pods: details.pods, // ✨ CONTRACT: Multiple ports
        mode: details.mode,
        cargoType: details.cargo_type || details.cargoType,
        commodityDescription: details.commodity || details.commodityDescription,
        declaredValue: details.declared_value || details.declaredValue,
        deliveryAddress: details.delivery_address || details.deliveryAddress,
        countryOfOrigin: details.country_of_origin || details.countryOfOrigin,
        preferentialTreatment: details.preferential_treatment || details.preferentialTreatment,
        psic: details.psic,
        aeo: details.aeo,
        
        // Load conditional fields
        containers: details.containers,
        fcl20ft: details.fcl_20ft || details.fcl20ft,
        fcl40ft: details.fcl_40ft || details.fcl40ft,
        fcl45ft: details.fcl_45ft || details.fcl45ft,
        fclQty: details.fcl_qty || details.fclQty,
        lclGwt: details.lcl_gwt || details.lclGwt,
        lclDims: details.lcl_dims || details.lclDims,
        airGwt: details.air_gwt || details.airGwt,
        airCwt: details.air_cwt || details.airCwt,
        
        // Export specific
        bookingConfirmation: details.booking_confirmation || details.bookingConfirmation,
        lct: details.lct,
        vgm: details.vgm,
        tareWeight: details.tare_weight || details.tareWeight,
        sealNumber: details.seal_number || details.sealNumber
      } as T;
    }
    
    if (serviceType === "Forwarding") {
      // Reconstruct compound fields from separate aol/pol and aod/pod
      const aolPol = details.aolPol || (details.aol && details.pol ? `${details.aol} → ${details.pol}` : "");
      const aodPod = details.aodPod || (details.aod && details.pod ? `${details.aod} → ${details.pod}` : "");
      
      return {
        ...defaultData,
        incoterms: details.incoterms,
        cargoType: details.cargo_type || details.cargoType,
        cargoNature: details.cargo_nature || details.cargoNature, // ✨ ADDED: Cargo Nature
        commodityDescription: details.commodity || details.commodityDescription,
        deliveryAddress: details.delivery_address || details.deliveryAddress,
        mode: details.mode,
        aolPol: aolPol,
        aodPod: aodPod,
        aol: details.aol,
        pol: details.pol,
        aod: details.aod,
        pod: details.pod,
        
        // Load conditional fields (Fix for missing EXW details and others)
        containers: details.containers,
        collectionAddress: details.collection_address || details.collectionAddress,
        carrierAirline: details.carrier_airline || details.carrierAirline,
        transitTime: details.transit_time || details.transitTime,
        route: details.route,
        stackable: details.stackable,
        lclGwt: details.lcl_gwt || details.lclGwt,
        lclDims: details.lcl_dims || details.lclDims,
        airGwt: details.air_gwt || details.airGwt,
        airCwt: details.air_cwt || details.airCwt,

        // Export specific
        bookingReference: details.booking_reference || details.bookingReference,
        lct: details.lct,
        vgm: details.vgm
      } as T;
    }
    
    if (serviceType === "Trucking") {
      // ✨ Multi-line trucking: normalize line items from saved data (handles legacy migration)
      const normalizedLineItems = normalizeTruckingLineItems(details);
      const firstItem = normalizedLineItems[0];
      return {
        ...defaultData,
        pullOut: details.pull_out || details.pullOut,
        // Legacy fields derived from first line item for backward compat
        deliveryAddress: firstItem?.destination || details.delivery_address || details.deliveryAddress,
        truckType: firstItem?.truckType || details.truck_type || details.truckType,
        qty: firstItem?.quantity || details.qty,
        deliveryInstructions: details.delivery_instructions || details.deliveryInstructions,
        aolPol: details.aol_pol || details.aolPol,
        truckingLineItems: normalizedLineItems,
        
        // Export specific
        shipper: details.shipper,
        driverName: details.driver_name || details.driverName,
        helperName: details.helper_name || details.helperName,
        vehicleRef: details.vehicle_ref || details.vehicleRef,
        withGps: details.with_gps || details.withGps,
        gateIn: details.gate_in || details.gateIn,
        cyFee: details.cy_fee || details.cyFee
      } as T;
    }
    
    if (serviceType === "Marine Insurance") {
      // Check aol_pol (snake_case saved by builder), then camelCase, then reconstruct from separate fields
      const aolPol = details.aol_pol || details.aolPol || (details.aol && details.pol ? `${details.aol} → ${details.pol}` : details.aol || "");
      const aodPod = details.aod_pod || details.aodPod || (details.aod && details.pod ? `${details.aod} → ${details.pod}` : details.aod || "");
      
      return {
        ...defaultData,
        commodityDescription: details.commodity_description || details.commodityDescription,
        hsCode: details.hs_code || details.hsCode,
        aolPol: aolPol,
        aodPod: aodPod,
        aol: details.aol,
        pol: details.pol,
        aod: details.aod,
        pod: details.pod,
        invoiceValue: details.invoice_value || details.invoiceValue
      } as T;
    }
    
    if (serviceType === "Others") {
      return {
        ...defaultData,
        serviceDescription: details.service_description || details.serviceDescription
      } as T;
    }
    
    return { ...defaultData, ...details };
  };

  // Service-specific form data
  const [brokerageData, setBrokerageData] = useState<BrokerageFormData>(
    loadServiceData("Brokerage", { brokerageType: "" })
  );
  const [forwardingData, setForwardingData] = useState<ForwardingFormData>(
    loadServiceData("Forwarding", {})
  );
  const [truckingData, setTruckingData] = useState<TruckingFormData>(
    loadServiceData("Trucking", {})
  );
  const [marineInsuranceData, setMarineInsuranceData] = useState<MarineInsuranceFormData>(
    loadServiceData("Marine Insurance", {})
  );
  const [othersData, setOthersData] = useState<OthersFormData>(
    loadServiceData("Others", {})
  );

  // Pricing
  const [chargeCategories, setChargeCategories] = useState<QuotationChargeCategory[]>(initialData?.charge_categories || []);
  const [currency, setCurrency] = useState(initialData?.currency || "PHP"); // ✨ PHP-First Default
  const [taxRate, setTaxRate] = useState(initialData?.financial_summary?.tax_rate || 0.12);
  const [otherCharges, setOtherCharges] = useState(initialData?.financial_summary?.other_charges || 0);
  
  // ✨ NEW: Dual-Section Pricing (Buying vs Selling)
  const [buyingPrice, setBuyingPrice] = useState<BuyingPriceCategory[]>(initialData?.buying_price || []);
  const [sellingPrice, setSellingPrice] = useState<SellingPriceCategory[]>(initialData?.selling_price || []);

  // ✨ GENERALIZED: Which selected services are covered by the detected contract?
  const contractCoveredServices = (() => {
    if (!detectedContract) return [] as string[];
    const contractServices = detectedContract.services.map(s => s.toLowerCase());
    return selectedServices.filter(service => {
      const sLower = service.toLowerCase();
      // Brokerage requires Standard subtype to use contract rates
      if (sLower === "brokerage" && brokerageData.brokerageType !== "Standard") return false;
      return contractServices.includes(sLower);
    });
  })();

  // ✨ GENERALIZED: Contract Rate Bridge — auto-detect active contracts for ANY service
  // Triggers when: project quotation + customer name set (service-agnostic detection)
  // NOTE: Must be declared after brokerageData and sellingPrice state
  useEffect(() => {
    // Only for project quotations
    if (isContractMode) return;
    // Need a customer name to look up
    if (!customerName || customerName.trim().length < 3) {
      setDetectedContract(null);
      return;
    }

    let cancelled = false;
    const detect = async () => {
      setContractBridgeLoading(true);
      try {
        // Service-agnostic: find ANY active contract for this customer
        const contract = await findContractForCustomerService(customerName);
        if (!cancelled) {
          setDetectedContract(contract);
          // If a different contract was detected, reset all applied states
          if (contract && sourceContractId && sourceContractId !== contract.id) {
            setContractRatesAppliedMap({});
            setRateBridgeInfoMap({});
          }
        }
      } catch (err) {
        console.error("[ContractRateBridge] Detection error:", err);
      } finally {
        // Always clear loading — guarding with `cancelled` causes a stuck spinner
        // when cleanup fires mid-fetch (new effect cycle sets it true again anyway)
        setContractBridgeLoading(false);
      }
    };

    const timer = setTimeout(detect, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isContractMode, customerName]);

  // ✨ GENERALIZED: Apply contract rates for a SPECIFIC service type
  const handleApplyContractRatesForService = async (serviceType: string, options?: { silent?: boolean }) => {
    if (!detectedContract) return;

    const isSilent = options?.silent === true;
    if (!isSilent) setContractBridgeLoading(true);

    try {
      // Fetch or use cached contract
      let fullContract = cachedFullContract;
      if (!fullContract || fullContract.id !== detectedContract.id) {
        fullContract = await fetchFullContract(detectedContract.id);
        if (!fullContract || !fullContract.rate_matrices?.length) {
          console.warn(`[ContractRateBridge] No rate matrices in contract for ${serviceType}`);
          if (!isSilent) setContractBridgeLoading(false);
          return;
        }
        setCachedFullContract(fullContract);
      }

      // ✨ GENERALIZED: Extract quantities + resolve mode per service type
      let resolvedMode: string | null = null;
      let quantities: any = undefined;
      let totalContainers = 0;
      let hasQuantities = false;
      let selections: Record<string, string> | undefined = undefined;

      const sLower = serviceType.toLowerCase();

      if (sLower === "brokerage") {
        const modeColumns = getContractModeColumns(fullContract.rate_matrices!, "Brokerage");
        const bridgeResult = extractForRateBridge(
          brokerageData,
          modeColumns,
          brokerageData.mode,
          undefined
        );
        resolvedMode = bridgeResult.resolvedMode;
        quantities = bridgeResult.hasQuantities ? bridgeResult.quantities : undefined;
        totalContainers = bridgeResult.totalContainers;
        hasQuantities = bridgeResult.hasQuantities;
      } else if (sLower === "trucking") {
        // ✨ Multi-line trucking: extract per-item selections and quantities
        const lineItems = normalizeTruckingLineItems(truckingData);
        const modeColumns = getContractModeColumns(fullContract.rate_matrices!, "Trucking");
        resolvedMode = modeColumns.length > 0
          ? resolveModeFromForm(modeColumns, lineItems[0]?.truckType || truckingData.truckType)
          : null;
        const extractions = extractMultiLineSelectionsAndQuantities(lineItems, fullContract.rate_matrices!);
        totalContainers = lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);
        hasQuantities = totalContainers > 0;

        if (hasQuantities && extractions.length > 0) {
          // Use multi-pass wrapper to produce N categories (one per line item)
          const contractCategories = multiLineRatesToSellingPrice(
            fullContract.rate_matrices!,
            resolvedMode ? [resolvedMode] : undefined,
            extractions
          );

          if (contractCategories.length > 0) {
            const matrix = fullContract.rate_matrices!.find(
              m => m.service_type.toLowerCase() === "trucking"
            );
            const matrixId = matrix?.id || "trucking";

            setSellingPrice(prev => {
              const filtered = prev.filter(cat =>
                !cat.id.startsWith(`contract-cat-${matrixId}`)
              );
              return [...filtered, ...contractCategories];
            });

            setSourceContractId(detectedContract.id);
            setSourceContractNumber(detectedContract.quote_number);
            setContractRatesAppliedMap(prev => ({ ...prev, [serviceType]: true }));
            const estimatedTotal = contractCategories.reduce((sum, cat) => sum + cat.subtotal, 0);
            setRateBridgeInfoMap(prev => ({
              ...prev,
              [serviceType]: { resolvedMode, totalContainers, estimatedTotal },
            }));
          }

          if (!isSilent) setContractBridgeLoading(false);
          return; // Early return — multi-line path handled everything
        }

        // Fallback: use legacy single-item path (backward compat for zero-quantity)
        quantities = extractQuantitiesFromTruckingForm(truckingData);
        selections = extractTruckingSelections(truckingData, fullContract.rate_matrices!);
      } else if (sLower === "others") {
        quantities = extractQuantitiesFromOthersForm();
        totalContainers = 0;
        hasQuantities = true; // Others always has qty=1
        // Others typically has a single column or no mode resolution needed
        const modeColumns = getContractModeColumns(fullContract.rate_matrices!, "Others");
        resolvedMode = modeColumns.length > 0 ? modeColumns[0] : null;
      } else {
        // Unsupported service type for contract rates
        console.warn(`[ContractRateBridge] No quantity extractor for service: ${serviceType}`);
        if (!isSilent) setContractBridgeLoading(false);
        return;
      }

      // ✨ GENERALIZED: Generate selling price categories for this service
      const contractCategories = contractRatesToSellingPrice(
        fullContract.rate_matrices!,
        serviceType,
        resolvedMode ? [resolvedMode] : undefined,
        hasQuantities ? quantities : undefined,
        selections
      );

      if (contractCategories.length > 0) {
        // ✨ Service-aware selling price update: only replace categories for THIS service
        const servicePrefix = `contract-cat-`;
        // Find the matrix ID for this service to scope removal
        const matrix = fullContract.rate_matrices!.find(
          m => m.service_type.toLowerCase() === sLower
        );
        const matrixId = matrix?.id || sLower;

        setSellingPrice(prev => {
          // Remove only contract categories belonging to this service's matrix
          const filtered = prev.filter(cat =>
            !cat.id.startsWith(`${servicePrefix}${matrixId}`)
          );
          return [...filtered, ...contractCategories];
        });

        setSourceContractId(detectedContract.id);
        setSourceContractNumber(detectedContract.quote_number);

        // Update per-service maps
        setContractRatesAppliedMap(prev => ({ ...prev, [serviceType]: true }));
        const estimatedTotal = contractCategories.reduce((sum, cat) => sum + cat.subtotal, 0);
        setRateBridgeInfoMap(prev => ({
          ...prev,
          [serviceType]: { resolvedMode, totalContainers, estimatedTotal },
        }));
      }
    } catch (err) {
      console.error(`[ContractRateBridge] Error applying ${serviceType} rates:`, err);
    } finally {
      if (!isSilent) setContractBridgeLoading(false);
    }
  };

  // ✨ GENERALIZED: Apply contract rates for ALL covered services at once
  const handleApplyAllContractRates = async () => {
    if (!detectedContract || contractCoveredServices.length === 0) return;
    for (const service of contractCoveredServices) {
      await handleApplyContractRatesForService(service);
    }
  };

  // ✨ BACKWARD COMPAT: Legacy wrapper (used by existing banner until Phase 4)
  const handleApplyContractRates = async (options?: { silent?: boolean }) => {
    // If we have covered services, apply the first one (Brokerage in most cases)
    // Otherwise fall back to "Brokerage" for backward compat
    const target = contractCoveredServices.includes("Brokerage") ? "Brokerage" : contractCoveredServices[0] || "Brokerage";
    await handleApplyContractRatesForService(target, options);
  };

  // ✨ GENERALIZED: Auto-recalculate per service when shipment config changes
  // Brokerage: watches containers, mode
  useEffect(() => {
    if (!contractRatesAppliedMap["Brokerage"] || !detectedContract || !cachedFullContract) return;

    const timer = setTimeout(() => {
      handleApplyContractRatesForService("Brokerage", { silent: true });
    }, 300);

    return () => clearTimeout(timer);
  }, [
    JSON.stringify(brokerageData.containers),
    brokerageData.mode,
    brokerageData.fcl20ft,
    brokerageData.fcl40ft,
    brokerageData.fcl45ft,
    brokerageData.fclQty,
  ]);

  // Trucking: watches qty, truckType
  useEffect(() => {
    if (!contractRatesAppliedMap["Trucking"] || !detectedContract || !cachedFullContract) return;

    const timer = setTimeout(() => {
      handleApplyContractRatesForService("Trucking", { silent: true });
    }, 300);

    return () => clearTimeout(timer);
  }, [JSON.stringify(truckingData.truckingLineItems), truckingData.qty, truckingData.truckType, truckingData.deliveryAddress]);

  // ✨ NEW: Category Expansion State (for collapsible categories)
  const [expandedBuyingCategories, setExpandedBuyingCategories] = useState<Set<string>>(
    new Set(initialData?.buying_price?.map(cat => cat.id) || []) // Initially expand all
  );
  const [expandedSellingCategories, setExpandedSellingCategories] = useState<Set<string>>(
    new Set(initialData?.selling_price?.map(cat => cat.id) || []) // Initially expand all
  );

  // ✨ NEW: Category Management Handlers
  const handleToggleBuyingCategory = (categoryId: string) => {
    setExpandedBuyingCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const handleToggleSellingCategory = (categoryId: string) => {
    setExpandedSellingCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const handleAddBuyingCategory = (categoryName: string = "New Category") => {
    // Create a new empty category with the provided name
    const newCategory: BuyingPriceCategory = {
      id: generateCategoryId(),
      category_name: categoryName,
      name: categoryName,
      line_items: [],
      subtotal: 0
    };
    
    setBuyingPrice(prev => [...prev, newCategory]);
    
    // Auto-expand the new category
    setExpandedBuyingCategories(prev => new Set(prev).add(newCategory.id));
    
    console.log(`✅ Added new buying category: ${newCategory.category_name}`);
  };

  const handleAddSellingCategory = (categoryName: string = "New Category") => {
    // ✨ VALIDATION: Check if category name already exists (case-insensitive)
    const normalizedName = categoryName.toLowerCase().trim();
    const duplicateExists = sellingPrice.some(cat =>
      cat.category_name.toLowerCase().trim() === normalizedName
    );

    let finalCategoryName = categoryName;

    // If duplicate exists, append number to make it unique
    if (duplicateExists) {
      let counter = 1;
      while (sellingPrice.some(cat => cat.category_name.toLowerCase().trim() === `${normalizedName} ${counter}`)) {
        counter++;
      }
      finalCategoryName = `${categoryName} ${counter}`;
    }

    // Add category to local state immediately — instant UI feedback
    const localId = generateCategoryId();
    const newCategory: SellingPriceCategory = {
      id: localId,
      category_name: finalCategoryName,
      name: finalCategoryName,
      line_items: [],
      subtotal: 0,
    };
    setSellingPrice(prev => [...prev, newCategory]);
    setExpandedSellingCategories(prev => new Set(prev).add(localId));

    // Background: look up or create the catalog category, then patch catalog_category_id
    (async () => {
      try {
        const { data: existing } = await supabase
          .from("catalog_categories")
          .select("id")
          .ilike("name", finalCategoryName.trim())
          .in("side", ["revenue", "both"])
          .maybeSingle();

        let catalogCategoryId: string | undefined;
        if (existing) {
          catalogCategoryId = existing.id;
        } else {
          const newId = `cat-${Date.now()}`;
          const { data: created } = await supabase
            .from("catalog_categories")
            .insert({
              id: newId,
              name: finalCategoryName.trim(),
              side: "revenue",
              sort_order: 100,
              is_default: false,
            })
            .select("id")
            .single();
          if (created) {
            catalogCategoryId = created.id;
            // Only invalidate categories — not catalog.all() which triggers a cascade
            // of refetches (items, usageCounts, matrix) that exhausts the connection pool
            queryClient.invalidateQueries({ queryKey: queryKeys.catalog.categories() });
            toast.success(`"${finalCategoryName}" added to catalog`);
          }
        }

        if (catalogCategoryId) {
          setSellingPrice(prev => prev.map(cat =>
            cat.id === localId ? { ...cat, catalog_category_id: catalogCategoryId } : cat
          ));
        }
      } catch (err) {
        console.error("Catalog category sync failed:", err);
      }
    })();
  };

  const handleAddItemToBuyingCategory = (categoryId: string) => {
    // Create a new empty line item
    const newItem: QuotationLineItemNew = {
      id: generateLineItemId(),
      description: "",
      unit: "",
      quantity: 1,
      price: 0,
      currency: currency,
      forex_rate: 1.0,
      is_taxed: false,
      amount: 0,
      remarks: "",
      service_tag: "",
      service: "" // ✨ NEW: Initialize service field
    };
    
    // Add the item to the category
    setBuyingPrice(prev => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      
      const updatedItems = [...cat.line_items, newItem];
      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
      
      return {
        ...cat,
        line_items: updatedItems,
        subtotal
      };
    }));
    
    // Ensure category is expanded
    setExpandedBuyingCategories(prev => new Set(prev).add(categoryId));
    
    console.log(`✅ Added new item to buying category ${categoryId}`);
  };

  const handleAddItemToSellingCategory = (categoryId: string) => {
    // ✨ NEW: Smart Default for Service Tag
    // If the quotation is for a specific service (single selection), auto-assign it.
    let defaultService = "";
    if (selectedServices.length === 1) {
      defaultService = selectedServices[0];
    } else if (selectedServices.includes("Forwarding")) {
      defaultService = "Forwarding"; // Default priority if multiple
    } else if (selectedServices.includes("Brokerage")) {
      defaultService = "Brokerage";
    }

    // Create a new empty line item with selling price fields
    const newItem: SellingPriceLineItem = {
      id: generateLineItemId(),
      description: "",
      unit: "",
      quantity: 1,
      price: 0,
      base_cost: 0,
      amount_added: 0,
      percentage_added: 0,
      final_price: 0,
      currency: currency,
      forex_rate: 1.0,
      is_taxed: false,
      amount: 0,
      remarks: "",
      service_tag: defaultService,
      service: defaultService // ✨ NEW: Initialize service field with smart default
    };
    
    // Add the item to the category
    setSellingPrice(prev => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      
      const updatedItems = [...cat.line_items, newItem];
      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
      
      return {
        ...cat,
        line_items: updatedItems,
        subtotal
      };
    }));
    
    // Ensure category is expanded
    setExpandedSellingCategories(prev => new Set(prev).add(categoryId));
    
    console.log(`✅ Added new item to selling category ${categoryId}`);
  };

  const handleRenameBuyingCategory = (categoryId: string, newName: string) => {
    setBuyingPrice(prev => prev.map(cat =>
      cat.id === categoryId ? { ...cat, category_name: newName, name: newName } : cat
    ));
  };

  /**
   * Renames a selling price category with duplicate name validation.
   * 
   * **Validation:** Case-insensitive duplicate detection prevents conflicts.
   * This is critical for merged categories to avoid name collisions.
   * 
   * @param categoryId - ID of category to rename
   * @param newName - New category name
   * @returns void (shows alert if duplicate found, blocks operation)
   */
  const handleRenameSellingCategory = (categoryId: string, newName: string) => {
    // ✨ VALIDATION: Prevent duplicate category names (case-insensitive)
    const normalizedNewName = newName.toLowerCase().trim();
    const duplicateExists = sellingPrice.some(cat => 
      cat.id !== categoryId && cat.category_name.toLowerCase().trim() === normalizedNewName
    );
    
    if (duplicateExists) {
      alert(`A category named "${newName}" already exists. Please choose a different name.`);
      console.log(`⚠️  Rename blocked: Category "${newName}" already exists`);
      return;
    }
    
    setSellingPrice(prev => prev.map(cat =>
      cat.id === categoryId ? { ...cat, category_name: newName, name: newName } : cat
    ));
    
    console.log(`✅ Renamed category ${categoryId} to "${newName}"`);
  };

  const handleDuplicateBuyingCategory = (categoryId: string) => {
    const categoryToDuplicate = buyingPrice.find(cat => cat.id === categoryId);
    if (categoryToDuplicate) {
      const newCategory = {
        ...categoryToDuplicate,
        id: generateCategoryId(),
        category_name: `${categoryToDuplicate.category_name} (Copy)`,
        name: `${categoryToDuplicate.name} (Copy)`,
        line_items: categoryToDuplicate.line_items.map(item => ({
          ...item,
          id: generateLineItemId()
        }))
      };
      setBuyingPrice(prev => [...prev, newCategory]);
      
      // Auto-expand the new category
      setExpandedBuyingCategories(prev => new Set(prev).add(newCategory.id));
    }
  };

  /**
   * Duplicates a selling price category with smart name generation.
   * 
   * **Smart Naming:**
   * - First duplicate: "Category Name (Copy)"
   * - Second duplicate: "Category Name (Copy 2)"
   * - Third duplicate: "Category Name (Copy 3)" etc.
   * 
   * **Important:** Line items get new IDs but preserve vendor_id for internal tracking.
   * This allows duplicating merged categories while maintaining vendor associations.
   * 
   * @param categoryId - ID of category to duplicate
   */
  const handleDuplicateSellingCategory = (categoryId: string) => {
    const categoryToDuplicate = sellingPrice.find(cat => cat.id === categoryId);
    if (categoryToDuplicate) {
      // ✨ VALIDATION: Generate unique name if "(Copy)" already exists
      let newName = `${categoryToDuplicate.category_name} (Copy)`;
      let counter = 1;
      
      // Keep incrementing counter until we find a unique name
      while (sellingPrice.some(cat => cat.category_name.toLowerCase().trim() === newName.toLowerCase().trim())) {
        counter++;
        newName = `${categoryToDuplicate.category_name} (Copy ${counter})`;
      }
      
      const newCategory = {
        ...categoryToDuplicate,
        id: generateCategoryId(),
        category_name: newName,
        name: newName,
        line_items: categoryToDuplicate.line_items.map(item => ({
          ...item,
          id: generateLineItemId()
        }))
      };
      setSellingPrice(prev => [...prev, newCategory]);
      
      // Auto-expand the new category
      setExpandedSellingCategories(prev => new Set(prev).add(newCategory.id));
      
      console.log(`✅ Duplicated category "${categoryToDuplicate.category_name}" as "${newName}"`);
    }
  };

  const handleDeleteBuyingCategory = (categoryId: string) => {
    if (confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
      setBuyingPrice(prev => prev.filter(cat => cat.id !== categoryId));
      setExpandedBuyingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
      });
    }
  };

  const handleDeleteSellingCategory = (categoryId: string) => {
    if (confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
      setSellingPrice(prev => prev.filter(cat => cat.id !== categoryId));
      setExpandedSellingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
      });
    }
  };

  // 🔄 AUTO-MIGRATION: Convert old quotations to new dual-pricing format
  useEffect(() => {
    // Only migrate if:
    // 1. We have chargeCategories (old data exists)
    // 2. We don't have buying_price or selling_price (hasn't been migrated yet)
    // 3. We're in edit mode (not creating new quotation)
    const shouldMigrate = 
      mode === "edit" && 
      chargeCategories.length > 0 && 
      buyingPrice.length === 0 && 
      sellingPrice.length === 0;

    if (shouldMigrate) {
      console.log("🔄 Auto-migrating old quotation to dual-pricing format...");
      
      // Convert chargeCategories to buyingPrice (assume they're vendor costs)
      setBuyingPrice(chargeCategories);
      
      // Convert to sellingPrice with 0% markup
      const migratedSellingPrice = chargeCategories.map(cat => ({
        ...cat,
        line_items: cat.line_items.map(item => ({
          ...item,
          base_cost: item.price,
          amount_added: 0,
          percentage_added: 0,
          final_price: item.price,
          price: item.price,
          amount: item.price * item.quantity * item.forex_rate
        } as SellingPriceLineItem))
      }));
      
      setSellingPrice(migratedSellingPrice);
      
      console.log(`✅ Migration complete: ${chargeCategories.length} categories migrated`);
      console.log("   → Buying Price populated with existing charges");
      console.log("   → Selling Price initialized with 0% markup");
    }
  }, [mode, chargeCategories.length]); // Only run on mount or when these values change


  /**
   * 🔄 AUTO-SYNC: Buying Price → Selling Price synchronization.
   * 
   * Automatically updates selling price when vendor costs change in buying price.
   * This hook is CRITICAL for the dual-pricing system to work correctly.
   * 
   * **Sync Strategy:**
   * - Uses line item ID matching (not category ID) to support merged categories
   * - Flat map (buyingItemsMap) provides O(1) lookup performance
   * - Preserves user-defined markups during base cost updates
   * 
   * **Data Flow:**
   * ```
   * Buying Price Change (vendor cost)
   *        ↓
   *   Find matching line item by ID (buyingItemsMap.get)
   *        ↓
   *   Copy buying price into base_cost as the signed unit cost
   *        ↓
   *   Preserve markup: final_price = base_cost + amount_added
   *        ↓
   *   Update selling price (amount_added & percentage_added unchanged)
   * ```
   * 
   * **Merged Category Support:**
   * - Selling category "Origin Charges" may contain items from Vendor A & B
   * - Buying Price has separate categories for Vendor A and Vendor B
   * - Line item IDs are unique and maintained across categories
   * - Sync matches by ID, so changes in Vendor A's buying price update 
   *   the correct items in the merged selling category
   * 
   * **Orphaned Items Handling:**
   * - If line item exists in selling but not buying (user deleted vendor item),
   *   the selling item is preserved unchanged to prevent data loss
   * - Console warns about orphaned items for debugging
   * 
   * @triggers When buyingPrice state changes
   * @updates sellingPrice state with recalculated base costs and final prices
   */
  useEffect(() => {
    // Only sync if both exist and we're not in the initial load
    if (buyingPrice.length > 0 && sellingPrice.length > 0) {
      console.log('🔄 SYNC: Buying Price → Selling Price');
      
      // Create a flat map of all line items from buying price for quick lookup
      // Key = line item ID, Value = buying price line item
      // This allows us to sync across merged categories
      const buyingItemsMap = new Map<string, QuotationLineItemNew>();
      
      buyingPrice.forEach(buyingCat => {
        buyingCat.line_items.forEach(item => {
          buyingItemsMap.set(item.id, item);
        });
      });
      
      console.log(`   → Buying Price: ${buyingItemsMap.size} line items indexed`);
      
      // Update selling price categories
      const updatedSellingPrice = sellingPrice.map(sellingCat => {
        // Update each line item in selling category
        const updatedItems = sellingCat.line_items.map(sellingItem => {
          // Find matching buying item by line item ID (not category ID)
          // This works across merged categories because line items maintain their IDs
          const matchingBuyingItem = buyingItemsMap.get(sellingItem.id);
          
          if (!matchingBuyingItem) {
            // 🏷️ ORPHANED ITEM: No matching buying item found
            // This can happen in two scenarios:
            // 1. User manually added item to selling price (intentional - keep as-is)
            // 2. User deleted item from buying price (intentional - preserve customer pricing)
            // In both cases, we preserve the item unchanged to prevent data loss
            console.log(`   ⚠️  No match for selling item "${sellingItem.description}" (ID: ${sellingItem.id})`);
            return sellingItem;
          }
          
          return calculateSellingItemFromBuyingPrice(sellingItem, matchingBuyingItem);
        });
        
        // Recalculate category subtotal
        const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
        
        return {
          ...sellingCat,
          line_items: updatedItems,
          subtotal
        };
      });
      
      console.log(`   ✅ Sync complete: ${sellingPrice.length} categories updated`);
      
      setSellingPrice(updatedSellingPrice);
    }
  }, [buyingPrice]); // Trigger when buying price changes

  // Auto-sync handlers - when a field changes in one service, update it in all others
  const handleBrokerageChange = (newData: BrokerageFormData) => {
    setBrokerageData(newData);
    
    // Sync overlapping fields to other services (only sync if value exists)
    if (selectedServices.includes("Forwarding")) {
      setForwardingData(prev => ({
        ...prev,
        ...(newData.pod && { aodPod: newData.pod }),
        ...(newData.commodityDescription && { commodityDescription: newData.commodityDescription }),
        ...(newData.cargoType && { cargoType: newData.cargoType }),
        ...(newData.mode && { mode: newData.mode }),
        ...(newData.deliveryAddress && { deliveryAddress: newData.deliveryAddress }),
        ...(newData.containers && { containers: newData.containers }),
        ...(newData.fcl20ft !== undefined && { fcl20ft: newData.fcl20ft }),
        ...(newData.fcl40ft !== undefined && { fcl40ft: newData.fcl40ft }),
        ...(newData.fcl45ft !== undefined && { fcl45ft: newData.fcl45ft }),
        ...(newData.fclQty !== undefined && { fclQty: newData.fclQty }),
        ...(newData.lclGwt && { lclGwt: newData.lclGwt }),
        ...(newData.lclDims && { lclDims: newData.lclDims }),
        ...(newData.airGwt && { airGwt: newData.airGwt }),
        ...(newData.airCwt && { airCwt: newData.airCwt }),
        ...(newData.countryOfOrigin && { countryOfOrigin: newData.countryOfOrigin }),
        ...(newData.preferentialTreatment && { preferentialTreatment: newData.preferentialTreatment }),
      }));
    }
    
    if (selectedServices.includes("Trucking")) {
      setTruckingData(prev => ({
        ...prev,
        ...(newData.deliveryAddress && { deliveryAddress: newData.deliveryAddress }),
      }));
    }
    
    if (selectedServices.includes("Marine Insurance")) {
      setMarineInsuranceData(prev => ({
        ...prev,
        ...(newData.pod && { aodPod: newData.pod }),
        ...(newData.commodityDescription && { commodityDescription: newData.commodityDescription }),
      }));
    }
  };

  const handleForwardingChange = (newData: ForwardingFormData) => {
    setForwardingData(newData);
    
    // Sync overlapping fields to other services (only sync if value exists)
    if (selectedServices.includes("Brokerage")) {
      setBrokerageData(prev => ({
        ...prev,
        ...(newData.aodPod && { pod: newData.aodPod }),
        ...(newData.commodityDescription && { commodityDescription: newData.commodityDescription }),
        ...(newData.cargoType && { cargoType: newData.cargoType }),
        ...(newData.mode && { mode: newData.mode }),
        ...(newData.deliveryAddress && { deliveryAddress: newData.deliveryAddress }),
        ...(newData.containers && { containers: newData.containers }),
        ...(newData.fcl20ft !== undefined && { fcl20ft: newData.fcl20ft }),
        ...(newData.fcl40ft !== undefined && { fcl40ft: newData.fcl40ft }),
        ...(newData.fcl45ft !== undefined && { fcl45ft: newData.fcl45ft }),
        ...(newData.fclQty !== undefined && { fclQty: newData.fclQty }),
        ...(newData.lclGwt && { lclGwt: newData.lclGwt }),
        ...(newData.lclDims && { lclDims: newData.lclDims }),
        ...(newData.airGwt && { airGwt: newData.airGwt }),
        ...(newData.airCwt && { airCwt: newData.airCwt }),
        ...(newData.countryOfOrigin && { countryOfOrigin: newData.countryOfOrigin }),
        ...(newData.preferentialTreatment && { preferentialTreatment: newData.preferentialTreatment }),
      }));
    }
    
    if (selectedServices.includes("Trucking")) {
      setTruckingData(prev => ({
        ...prev,
        ...(newData.deliveryAddress && { deliveryAddress: newData.deliveryAddress }),
      }));
    }
    
    if (selectedServices.includes("Marine Insurance")) {
      setMarineInsuranceData(prev => ({
        ...prev,
        ...(newData.aolPol && { aolPol: newData.aolPol }),
        ...(newData.aodPod && { aodPod: newData.aodPod }),
        ...(newData.commodityDescription && { commodityDescription: newData.commodityDescription }),
      }));
    }
  };

  const handleTruckingChange = (newData: TruckingFormData) => {
    setTruckingData(newData);
    
    // Sync delivery address to other services (only sync if value exists)
    if (newData.deliveryAddress) {
      if (selectedServices.includes("Brokerage")) {
        setBrokerageData(prev => ({
          ...prev,
          deliveryAddress: newData.deliveryAddress,
        }));
      }
      
      if (selectedServices.includes("Forwarding")) {
        setForwardingData(prev => ({
          ...prev,
          deliveryAddress: newData.deliveryAddress,
        }));
      }
    }
  };

  const handleMarineInsuranceChange = (newData: MarineInsuranceFormData) => {
    setMarineInsuranceData(newData);
    
    // Sync overlapping fields to other services (only sync if value exists)
    if (selectedServices.includes("Forwarding")) {
      setForwardingData(prev => ({
        ...prev,
        ...(newData.aolPol && { aolPol: newData.aolPol }),
        ...(newData.aodPod && { aodPod: newData.aodPod }),
        ...(newData.commodityDescription && { commodityDescription: newData.commodityDescription }),
      }));
    }
    
    if (selectedServices.includes("Brokerage")) {
      setBrokerageData(prev => ({
        ...prev,
        ...(newData.aodPod && { pod: newData.aodPod }),
        ...(newData.commodityDescription && { commodityDescription: newData.commodityDescription }),
      }));
    }
  };

  // Calculate financial summary
  // ✨ UPDATED: Now uses selling price instead of charge categories
  const financialSummary = calculateFinancialSummary(
    sellingPrice.length > 0 ? sellingPrice : chargeCategories, 
    taxRate, 
    otherCharges
  );
  
  /**
   * Converts Buying Price categories to Selling Price categories with zero markup.
   * 
   * This is the first step in the dual-pricing workflow:
   * 1. Vendor charges imported to Buying Price (cost basis)
   * 2. Auto-converted to Selling Price with 0% markup
   * 3. User adds markup to create customer-facing prices
   * 
   * @param buyingCategories - Array of buying price categories (vendor costs)
   * @returns Array of selling price categories with base_cost = buying price, markup = 0
   * 
   * @example
   * const sellingCategories = convertBuyingToSelling(buyingPrice);
   * // Each line item gets: base_cost = price, amount_added = 0, final_price = price
   */
  const convertBuyingToSelling = (buyingCategories: BuyingPriceCategory[]): SellingPriceCategory[] => {
    return buyingCategories.map(cat => ({
      ...cat,
      line_items: cat.line_items.map(item => ({
        ...item,
        base_cost: item.price, // Base cost = buying price
        amount_added: 0, // Start with zero markup
        percentage_added: 0, // 0% markup
        final_price: item.price, // Final price = base cost (no markup yet)
        // Keep price and amount synced
        price: item.price,
        amount: item.price * item.quantity * item.forex_rate
      } as SellingPriceLineItem))
    }));
  };

  /**
   * 🔀 CORE MERGE ALGORITHM: Consolidates selling price categories by name.
   * 
   * When importing vendor charges, this function merges categories with identical names
   * (case-insensitive) to create a clean, consolidated customer-facing view.
   * 
   * **Business Logic:**
   * - If category name exists → MERGE line items into existing category
   * - If category name is new → CREATE new category
   * - Line items maintain vendor_id internally (not visible to customer)
   * - Subtotals auto-recalculate after merge
   * 
   * **Example Scenario:**
   * - Import Vendor A: "Origin Charges" (3 items)
   * - Import Vendor B: "Origin Charges" (2 items)  
   * - Result: 1 category "Origin Charges" with 5 items total
   * 
   * @param existingCategories - Current selling price categories
   * @param newCategories - New categories to merge in (from vendor import)
   * @returns Merged array with consolidated categories
   * 
   * @see IMPLEMENTATION_BLUEPRINT.md - Phase 2 for detailed design
   */
  const mergeSellingPriceCategories = (existingCategories: SellingPriceCategory[], newCategories: SellingPriceCategory[]): SellingPriceCategory[] => {
    const mergedCategories: SellingPriceCategory[] = [...existingCategories];
    
    newCategories.forEach(newCat => {
      // ✨ VALIDATION: Skip empty categories (no line items)
      if (!newCat.line_items || newCat.line_items.length === 0) {
        console.log(`⚠️  Skipping empty category "${newCat.category_name}"`);
        return;
      }
      
      // Normalize category name for comparison
      const normalizedName = newCat.category_name.toLowerCase().trim();
      
      // Check if a category with the same name already exists
      const existingCatIndex = mergedCategories.findIndex(
        cat => cat.category_name.toLowerCase().trim() === normalizedName
      );
      
      if (existingCatIndex !== -1) {
        // ✅ MERGE: Category exists - append line items
        const existingCat = mergedCategories[existingCatIndex];
        
        console.log(`🔄 MERGE: Appending ${newCat.line_items.length} items to existing category "${existingCat.category_name}"`);
        console.log(`   Before: ${existingCat.line_items.length} items, subtotal: ${existingCat.subtotal.toFixed(2)}`);
        
        // Merge line items into the existing category
        const updatedLineItems = [...existingCat.line_items, ...newCat.line_items];
        
        // Recalculate subtotal
        const subtotal = updatedLineItems.reduce((sum, item) => sum + item.amount, 0);
        
        console.log(`   After: ${updatedLineItems.length} items, subtotal: ${subtotal.toFixed(2)}`);
        
        // Update the existing category with merged line items and new subtotal
        mergedCategories[existingCatIndex] = {
          ...existingCat,
          line_items: updatedLineItems,
          subtotal
        };
      } else {
        // ✅ NEW: Category doesn't exist - create new
        console.log(`➕ NEW CATEGORY: Creating "${newCat.category_name}" with ${newCat.line_items.length} items`);
        mergedCategories.push(newCat);
      }
    });
    
    return mergedCategories;
  };

  /**
   * 📥 VENDOR IMPORT HANDLER: Imports vendor charges into dual-pricing system.
   * 
   * This is the entry point for vendor charge imports. It populates BOTH:
   * 1. **Buying Price** - Vendor costs (internal, per-vendor categories)
   * 2. **Selling Price** - Customer pricing (merged categories, no vendor info visible)
   * 
   * **Data Flow:**
   * ```
   * Vendor Charges → Buying Price (separate per vendor)
   *                ↓
   *          convertBuyingToSelling() (0% markup)
   *                ↓
   *          mergeSellingPriceCategories() (consolidate by name)
   *                ↓
   *          Selling Price (merged, customer-facing)
   * ```
   * 
   * **Format Support:**
   * - OLD: VendorLineItem[] (flat list, converted to category)
   * - NEW: QuotationChargeCategory[] (already categorized)
   * 
   * **Edge Cases Handled:**
   * - Empty import data (shows alert, returns early)
   * - Re-importing same vendor (creates new IDs, merges into selling)
   * - Categories with no line items (skipped during merge)
   * 
   * @param vendorId - Unique vendor identifier
   * @param vendorName - Vendor display name (for category naming in old format)
   * @param data - Vendor charges (old or new format)
   * @param vendorServiceTag - Optional service tag to auto-populate on line items
   * 
   * @see mergeSellingPriceCategories() - Core merge algorithm
   * @see convertBuyingToSelling() - Buying → Selling conversion
   */
  const handleImportVendorCharges = (
    vendorId: string, 
    vendorName: string, 
    data: VendorLineItem[] | QuotationChargeCategory[],
    vendorServiceTag?: string
  ) => {
    // ✨ VALIDATION: Handle empty import data
    if (!data || data.length === 0) {
      console.log(`⚠️  No charges to import from ${vendorName} (empty data)`);
      alert(`No charges available to import from ${vendorName}.`);
      return;
    }
    
    // Check if data is in new format (QuotationChargeCategory[])
    const isNewFormat = data.length > 0 && 'line_items' in data[0];
    
    if (isNewFormat) {
      // NEW FORMAT: Simply copy categories with vendor name prefix
      const importedCategories = (data as QuotationChargeCategory[]).map(cat => ({
        ...cat,
        id: generateCategoryId(), // Generate new ID for quotation
        category_name: cat.category_name, // Remove vendor name suffix
        name: cat.category_name, // Remove vendor name suffix (backward compatibility)
        line_items: cat.line_items.map(item => ({
          ...item,
          id: generateLineItemId(), // Generate new IDs for line items
          vendor_id: vendorId,
          service: vendorServiceTag || item.service || "" // ✨ NEW: Auto-populate service from vendor's service_tag
        }))
      }));
      
      // ✨ NEW: Populate buying price (vendor costs)
      const newBuyingPrice = [...buyingPrice, ...importedCategories];
      setBuyingPrice(newBuyingPrice);
      
      // ✨ NEW: Auto-copy to selling price with zero markup + MERGE LOGIC
      const newSellingCategories = convertBuyingToSelling(importedCategories);
      const mergedSellingPrice = mergeSellingPriceCategories(sellingPrice, newSellingCategories);
      setSellingPrice(mergedSellingPrice);
      
      // Auto-expand newly imported categories in buying price
      importedCategories.forEach(cat => {
        setExpandedBuyingCategories(prev => new Set(prev).add(cat.id));
      });
      
      // Auto-expand categories in selling price (including merged ones)
      newSellingCategories.forEach(newCat => {
        // Find the category in the merged result (might have been merged into existing)
        const normalizedName = newCat.category_name.toLowerCase().trim();
        const categoryInResult = mergedSellingPrice.find(
          cat => cat.category_name.toLowerCase().trim() === normalizedName
        );
        if (categoryInResult) {
          setExpandedSellingCategories(prev => new Set(prev).add(categoryInResult.id));
        }
      });
      
      // Keep backward compatibility: also add to charge_categories
      setChargeCategories([...chargeCategories, ...importedCategories]);
      
      console.log(`✅ Imported ${importedCategories.length} categories from ${vendorName} (new format)`);
      console.log(`   → Buying Price: ${newBuyingPrice.length} categories`);
      console.log(`   → Selling Price: ${sellingPrice.length + newSellingCategories.length} categories (0% markup)`);
    } else {
      // OLD FORMAT: Convert VendorLineItem[] to QuotationChargeCategory
      const lineItems = data as VendorLineItem[];
      const categoryName = `Charges from ${vendorName}`;
      
      // Convert vendor line items to QuotationLineItemNew format
      const convertedLineItems: QuotationLineItemNew[] = lineItems.map((item, index) => ({
        id: generateLineItemId(),
        description: item.description,
        price: item.unit_price,
        currency: item.currency,
        quantity: 1, // Default quantity
        unit: formatUnitType(item.unit_type),
        forex_rate: item.currency === currency ? 1.0 : 1.0, // Would need actual forex conversion
        is_taxed: false, // Default to non-taxed, user can modify
        remarks: formatUnitType(item.unit_type),
        amount: item.unit_price * 1 * 1.0, // price × quantity × forex_rate
        vendor_id: vendorId,
        service: vendorServiceTag || "" // ✨ NEW: Auto-populate service from vendor's service_tag
      }));

      // Calculate subtotal
      const subtotal = convertedLineItems.reduce((sum, item) => sum + item.amount, 0);

      // Create the new category
      const newCategory: QuotationChargeCategory = {
        id: generateCategoryId(),
        category_name: categoryName,
        name: categoryName, // Backward compatibility
        line_items: convertedLineItems,
        subtotal: subtotal
      };

      // ✨ NEW: Populate buying price (vendor costs)
      const newBuyingPrice = [...buyingPrice, newCategory];
      setBuyingPrice(newBuyingPrice);
      
      // ✨ NEW: Auto-copy to selling price with zero markup + MERGE LOGIC
      const newSellingCategories = convertBuyingToSelling([newCategory]);
      const mergedSellingPrice = mergeSellingPriceCategories(sellingPrice, newSellingCategories);
      setSellingPrice(mergedSellingPrice);
      
      // Auto-expand newly imported categories in buying price
      setExpandedBuyingCategories(prev => new Set(prev).add(newCategory.id));
      
      // Auto-expand categories in selling price (including merged ones)
      newSellingCategories.forEach(newCat => {
        // Find the category in the merged result (might have been merged into existing)
        const normalizedName = newCat.category_name.toLowerCase().trim();
        const categoryInResult = mergedSellingPrice.find(
          cat => cat.category_name.toLowerCase().trim() === normalizedName
        );
        if (categoryInResult) {
          setExpandedSellingCategories(prev => new Set(prev).add(categoryInResult.id));
        }
      });
      
      // Keep backward compatibility: also add to charge_categories
      setChargeCategories([...chargeCategories, newCategory]);
      
      console.log(`✅ Imported ${lineItems.length} charges from ${vendorName} (old format - converted)`);
      console.log(`   → Buying Price: ${newBuyingPrice.length} categories`);
      console.log(`   → Selling Price: ${sellingPrice.length + newSellingCategories.length} categories (0% markup)`);
    }
  };

  // Helper function to format unit_type to display format
  const formatUnitType = (unitType: string): string => {
    const unitMap: Record<string, string> = {
      'per_cbm': 'CBM',
      'per_container': 'Container',
      'per_shipment': 'Shipment',
      'per_kg': 'KG',
      'flat_fee': 'Flat'
    };
    return unitMap[unitType] || unitType;
  };

  const handleSaveAsDraft = () => {
    // When saving as draft, preserve existing status or default to Draft
    const draftStatus = initialData?.status || "Draft";
    saveQuotation(draftStatus);
  };

  const handleSubmit = () => {
    // If this is an amendment, preserve the existing status explicitly
    if (isAmendment) {
      // Use existing status if available
      if (initialData?.status) {
        saveQuotation(normalizeQuotationStatus(initialData.status, initialData));
        return;
      }
      
      // Fallback: If no status is provided but we have a project number,
      // it means this quotation is converted/linked to a project.
      if (initialData?.project_id || initialData?.project_number) {
        saveQuotation("Converted to Project" as QuotationStatus);
        return;
      }
      
      if (initialData?.quotation_type === "contract" && initialData?.contract_status === "Active") {
        saveQuotation("Converted to Contract" as QuotationStatus);
        return;
      }

      // Default fallback for amendments without status or a linked downstream record
      saveQuotation("Draft" as QuotationStatus);
      return;
    }

    // Determine the submit status based on builder mode
    if (builderMode === "inquiry") {
      // BD submitting inquiry to Pricing Department
      saveQuotation("Pending Pricing" as QuotationStatus);
    } else {
      // PD finishing pricing
      saveQuotation("Priced" as QuotationStatus);
    }
  };

  const saveQuotation = (targetStatus: QuotationStatus) => {
    // ✨ CONTRACT: Require validity end date before saving
    if (isContractMode && !contractValidityEnd) {
      setContractValidationAttempted(true);
      toast.error("Please set a 'Valid Until' date before saving this contract.");
      return;
    }

    // Build services_metadata from form data
    const services_metadata: InquiryService[] = [];
    
    if (selectedServices.includes("Brokerage")) {
      services_metadata.push({
        service_type: "Brokerage",
        service_details: {
          // Map camelCase form data to snake_case TypeScript types
          subtype: brokerageData.brokerageType as any, // brokerageType maps to subtype
          shipment_type: brokerageData.shipmentType as any, // Add shipment_type field
          type_of_entry: brokerageData.typeOfEntry,
          consumption: brokerageData.consumption,
          warehousing: brokerageData.warehousing,
          peza: brokerageData.peza,
          pod: brokerageData.pod,
          pods: brokerageData.pods, // ✨ CONTRACT: Multiple ports
          mode: brokerageData.mode,
          cargo_type: brokerageData.cargoType,
          commodity: brokerageData.commodityDescription, // commodityDescription maps to commodity
          declared_value: brokerageData.declaredValue,
          delivery_address: brokerageData.deliveryAddress,
          country_of_origin: brokerageData.countryOfOrigin,
          preferential_treatment: brokerageData.preferentialTreatment,
          psic: brokerageData.psic,
          aeo: brokerageData.aeo,
          
          // Save conditional fields
          containers: brokerageData.containers,
          fcl_20ft: brokerageData.fcl20ft,
          fcl_40ft: brokerageData.fcl40ft,
          fcl_45ft: brokerageData.fcl45ft,
          fcl_qty: brokerageData.fclQty,
          lcl_gwt: brokerageData.lclGwt,
          lcl_dims: brokerageData.lclDims,
          air_gwt: brokerageData.airGwt,
          air_cwt: brokerageData.airCwt,
          
          // Export specific
          booking_confirmation: brokerageData.bookingConfirmation,
          lct: brokerageData.lct,
          vgm: brokerageData.vgm,
          tare_weight: brokerageData.tareWeight,
          seal_number: brokerageData.sealNumber
        }
      });
    }
    
    if (selectedServices.includes("Forwarding")) {
      // Parse aolPol and aodPod if they exist (they might be combined fields)
      let aol = forwardingData.aol;
      let pol = forwardingData.pol;
      let aod = forwardingData.aod;
      let pod = forwardingData.pod;
      
      // Handle compound fields if they exist
      if (forwardingData.aolPol && !aol && !pol) {
        [aol, pol] = forwardingData.aolPol.split('→').map(s => s.trim());
      }
      if (forwardingData.aodPod && !aod && !pod) {
        [aod, pod] = forwardingData.aodPod.split('→').map(s => s.trim());
      }
      
      services_metadata.push({
        service_type: "Forwarding",
        service_details: {
          // Map camelCase form data to snake_case TypeScript types
          incoterms: forwardingData.incoterms,
          cargo_type: forwardingData.cargoType,
          cargo_nature: forwardingData.cargoNature, // ✨ ADDED: Cargo Nature
          commodity: forwardingData.commodityDescription || forwardingData.commodity,
          delivery_address: forwardingData.deliveryAddress,
          mode: forwardingData.mode,
          aolPol: forwardingData.aolPol, // ✨ ADDED: Save compound string
          aodPod: forwardingData.aodPod, // ✨ ADDED: Save compound string
          aol: aol,
          pol: pol || forwardingData.pol,
          aod: aod,
          pod: pod || forwardingData.pod,
          
          // Save conditional fields (Fix for missing EXW details and others)
          containers: forwardingData.containers,
          collection_address: forwardingData.collectionAddress,
          carrier_airline: forwardingData.carrierAirline,
          transit_time: forwardingData.transitTime,
          route: forwardingData.route,
          stackable: forwardingData.stackable,
          lcl_gwt: forwardingData.lclGwt,
          lcl_dims: forwardingData.lclDims,
          air_gwt: forwardingData.airGwt,
          air_cwt: forwardingData.airCwt,
          
          // Export specific
          booking_reference: forwardingData.bookingReference,
          lct: forwardingData.lct,
          vgm: forwardingData.vgm
        }
      });
    }
    
    if (selectedServices.includes("Trucking")) {
      // ✨ Multi-line trucking: normalize and persist line items
      const lineItems = normalizeTruckingLineItems(truckingData);
      const firstItem = lineItems[0];
      services_metadata.push({
        service_type: "Trucking",
        service_details: {
          // Legacy fields (first line item, for backward-compat readers)
          pull_out: truckingData.pullOut,
          delivery_address: firstItem?.destination || truckingData.deliveryAddress,
          truck_type: firstItem?.truckType || truckingData.truckType,
          qty: firstItem?.quantity || truckingData.qty,
          delivery_instructions: truckingData.deliveryInstructions,
          aol_pol: truckingData.aolPol,
          
          // ✨ Multi-line: full array (@see MULTI_LINE_TRUCKING_BLUEPRINT.md)
          trucking_line_items: lineItems,
          
          // Export specific
          shipper: truckingData.shipper,
          driver_name: truckingData.driverName,
          helper_name: truckingData.helperName,
          vehicle_ref: truckingData.vehicleRef,
          with_gps: truckingData.withGps,
          gate_in: truckingData.gateIn,
          cy_fee: truckingData.cyFee
        }
      });
    }
    
    if (selectedServices.includes("Marine Insurance")) {
      // Parse aolPol and aodPod if they exist
      let aol = marineInsuranceData.aol;
      let pol = marineInsuranceData.pol;
      let aod = marineInsuranceData.aod;
      let pod = marineInsuranceData.pod;
      
      if (marineInsuranceData.aolPol && !aol && !pol) {
        [aol, pol] = marineInsuranceData.aolPol.split('→').map(s => s.trim());
      }
      if (marineInsuranceData.aodPod && !aod && !pod) {
        [aod, pod] = marineInsuranceData.aodPod.split('→').map(s => s.trim());
      }
      
      services_metadata.push({
        service_type: "Marine Insurance",
        service_details: {
          commodity_description: marineInsuranceData.commodityDescription,
          hs_code: marineInsuranceData.hsCode,
          // Save compound fields directly so load can recover them without splitting
          aol_pol: marineInsuranceData.aolPol,
          aod_pod: marineInsuranceData.aodPod,
          // Also save split fields for downstream consumers (e.g. invoices)
          aol: aol,
          pol: pol || marineInsuranceData.pol,
          aod: aod,
          pod: pod || marineInsuranceData.pod,
          invoice_value: marineInsuranceData.invoiceValue
        }
      });
    }
    
    if (selectedServices.includes("Others")) {
      services_metadata.push({
        service_type: "Others",
        service_details: {
          // Map camelCase form data to snake_case TypeScript types
          service_description: othersData.serviceDescription
        }
      });
    }

    const quotation: QuotationNew = {
      id: initialData?.id || `quot-${Date.now()}`,
      quote_number: quoteNumber,
      quotation_name: quotationName || `${customerName} - ${selectedServices.join(", ")}`,
      created_date: date,
      valid_until: isContractMode ? contractValidityEnd : validity,
      customer_id: customerId,
      customer_name: customerName,
      contact_person_id: contactPersonId, // Save contact person relationship
      contact_person_name: contactPersonName,
      
      // ✨ CONTRACT: Quotation type discriminator and contract-specific fields
      quotation_type: quotationType,
      ...(isContractMode && {
        contract_validity_start: date, // Auto-set to creation date (no longer a separate field)
        contract_validity_end: contractValidityEnd,
        contract_status: (initialData?.contract_status || "Draft") as any,
        scope_of_services: scopeOfServices.split("\n").filter((s: string) => s.trim()),
        terms_and_conditions: termsAndConditions.split("\n").filter((s: string) => s.trim()),
        rate_matrices: rateMatrices,
        contract_general_details: contractGeneralDetails,
      }),
      
      movement: movement,
      category: "SEA FREIGHT",
      shipment_freight: "LCL",
      services: selectedServices,
      services_metadata: services_metadata, // Save scope metadata for both project and contract modes
      incoterm: isContractMode ? "" : (forwardingData.incoterms || ""),
      carrier: isContractMode ? "" : (forwardingData.carrierAirline || "TBA"),
      transit_days: isContractMode ? 0 : parseInt(forwardingData.transitTime || "0"),
      
      commodity: isContractMode ? "" : (brokerageData.commodityDescription || forwardingData.commodityDescription || marineInsuranceData.commodityDescription || ""),
      pol_aol: isContractMode ? "" : (forwardingData.aolPol || marineInsuranceData.aolPol || ""),
      pod_aod: isContractMode ? "" : (forwardingData.aodPod || marineInsuranceData.aodPod || ""),
      
      charge_categories: isContractMode ? [] : chargeCategories,
      currency,
      financial_summary: financialSummary,
      
      credit_terms: isContractMode ? "" : creditTerms,
      validity_period: isContractMode ? "" : validity,
      
      // Set status based on builder mode and current state
      // Inquiry mode (BD): Draft or Pending Pricing when submitted
      // Quotation mode (PD): Preserve existing status, default to Priced if new
      status: targetStatus,
      created_by: initialData?.created_by || user?.id || "",
      created_at: initialData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      
      // ✨ NEW: Dual-Section Pricing (Buying vs Selling) — only for project quotations
      buying_price: isContractMode ? [] : buyingPrice,
      selling_price: isContractMode ? [] : sellingPrice,
      
      // ✨ PHASE 2: Contract Rate Bridge — link to source contract if rates were applied
      ...(sourceContractId && {
        source_contract_id: sourceContractId,
        source_contract_number: sourceContractNumber,
      }),
    };

    onSave(quotation);
  };

  const isFormValid = () => {
    // ✨ CONTRACT: Validate contract-specific fields
    if (isContractMode) {
      const hasRateRows = rateMatrices.some(m => m.rows.length > 0);
      return (
        customerName &&
        selectedServices.length > 0 &&
        date &&
        contractValidityEnd &&
        hasRateRows
      );
    }
    
    // In inquiry mode, don't require charge categories
    if (builderMode === "inquiry") {
      return (
        customerName &&
        selectedServices.length > 0 &&
        date
      );
    }
    
    // In quotation mode, require charge categories (old format) OR selling price (new dual-pricing format)
    const hasCharges = chargeCategories.length > 0 || sellingPrice.length > 0;
    return (
      customerName &&
      selectedServices.length > 0 &&
      date &&
      hasCharges
    );
  };

  // DRY composed labels — builderMode (who) × quotationType (what) × mode (action)
  const actionLabel = mode === "create" ? "Create" : "Edit";
  const typeLabel = isContractMode ? "Contract" : "Project";
  const entityLabel = builderMode === "inquiry" ? "Inquiry" : "Quotation";
  const pageTitle = `${actionLabel} ${typeLabel} ${entityLabel}`;

  // ✨ CONTRACT BANNER REDESIGN: Helper to render inline toolbar for a service
  const renderContractToolbar = (service: string) => {
    if (isContractMode || viewMode || !detectedContract) return undefined;
    const isCovered = contractCoveredServices.includes(service);
    if (!isCovered) return undefined;
    const isApplied = contractRatesAppliedMap[service];
    const info = rateBridgeInfoMap[service];
    // Brokerage-specific note
    let note: string | undefined;
    if (service === "Brokerage" && selectedServices.includes("Brokerage") && brokerageData.brokerageType !== "Standard") {
      note = "Contract rates only apply to Standard brokerage type.";
    }
    return (
      <ContractRateToolbar
        status={isApplied ? "applied" : "available"}
        onApply={() => handleApplyContractRatesForService(service)}
        onViewBreakdown={() => setBreakdownService(service)}
        loading={contractBridgeLoading}
        rateBridgeInfo={info}
        note={note}
      />
    );
  };

  return (
    <div style={{ 
      backgroundColor: "var(--theme-bg-surface)",
      display: "flex",
      flexDirection: "column",
      height: hideHeader ? "auto" : "100vh"
    }}>
      {/* Header Bar - Hidden in view mode when used inside QuotationFileView */}
      {!hideHeader && (
      <div style={{
        padding: "20px 48px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface-subtle)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 20
      }}>
        <div>
          <h1 style={{ 
            fontSize: "24px",
            fontWeight: 600,
            color: "var(--neuron-brand-green)",
            marginBottom: "4px"
          }}>
            {pageTitle}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>
            Quote Number: <strong>{quoteNumber}</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--neuron-ink-muted)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <X size={16} />
            Cancel
          </button>

          {!isAmendment && (
            <button
              onClick={handleSaveAsDraft}
              style={{
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Save size={16} />
              Save as Draft
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isFormValid() || isLocked}
            style={{
              padding: "8px 24px",
              fontSize: "13px",
              fontWeight: 600,
              color: (isFormValid() && !isLocked) ? "white" : "var(--theme-text-muted)",
              backgroundColor: (isFormValid() && !isLocked) ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)",
              border: "none",
              borderRadius: "6px",
              cursor: (isFormValid() && !isLocked) ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <FileText size={16} />
            {isAmendment 
              ? "Save Changes" 
              : builderMode === "inquiry" 
                ? `Submit ${typeLabel} Inquiry to Pricing` 
                : `Submit ${typeLabel} for Approval`
            }
          </button>
        </div>
      </div>
      )}

      {/* Main Content Area */}
      <div style={{ 
        flex: 1,
        overflow: "auto"
      }}>
        {/* Locked Warning Banner */}
        {isLocked && (
          <div style={{
            backgroundColor: "var(--theme-status-warning-bg)",
            border: "1px solid var(--theme-status-warning-border)",
            borderRadius: "8px",
            padding: "16px 20px",
            margin: "24px 48px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <div style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: "var(--theme-status-warning-fg)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 600,
              flexShrink: 0
            }}>
              🔒
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-status-warning-fg)", marginBottom: "4px" }}>
                This quotation is locked
              </div>
              <div style={{ fontSize: "13px", color: "var(--theme-status-warning-fg)", lineHeight: "1.5" }}>
                This quotation has been converted to project <strong>{initialData?.project_number}</strong>. 
                Pricing cannot be changed to maintain data integrity. You are in view-only mode.
              </div>
            </div>
          </div>
        )}


        
        {/* Form Sections (Scrollable) */}
        <div style={{ 
          padding: "32px 48px",
          maxWidth: "1400px",
          margin: "0 auto",
          overflow: "visible"
        }}>
          
          {/* Form Content Wrapper - All interactions disabled in view mode */}
          <div style={{
            position: "relative",
            opacity: viewMode ? 1 : 1, // Reset opacity to 1 as individual components handle their own read-only styling
            transition: "opacity 0.2s ease"
          }}>
          
          {/* ✨ CONTRACT: Quotation type is now pre-selected externally via the Create button dropdown */}

          {/* View mode: Quotation type indicator for contracts */}
          {viewMode && quotationType === "contract" && (
            null
          )}

          {/* General Details Section */}
          <GeneralDetailsSection
            customerId={customerId}
            setCustomerId={setCustomerId}
            customerName={customerName}
            setCustomerName={setCustomerName}
            contactPersonId={contactPersonId}
            setContactPersonId={setContactPersonId}
            contactPersonName={contactPersonName}
            setContactPersonName={setContactPersonName}
            quotationName={quotationName}
            setQuotationName={setQuotationName}
            selectedServices={selectedServices}
            setSelectedServices={setSelectedServices}
            date={date}
            setDate={setDate}
            creditTerms={creditTerms}
            setCreditTerms={setCreditTerms}
            validity={validity}
            setValidity={setValidity}
            movement={movement}
            setMovement={setMovement}
            viewMode={viewMode}
            onAmend={onAmend}
            quotationType={quotationType}
            contractValidityStart={contractValidityStart}
            setContractValidityStart={setContractValidityStart}
            contractValidityEnd={contractValidityEnd}
            setContractValidityEnd={setContractValidityEnd}
            showValidityEndError={contractValidationAttempted && isContractMode && !contractValidityEnd}
            isEditMode={mode === "edit"}
            contractDetection={!isContractMode ? {
              loading: contractBridgeLoading,
              contract: detectedContract,
              noContractFound: !contractBridgeLoading && !detectedContract && customerName.trim().length >= 3,
            } : undefined}
          />

          {/* ✨ CONTRACT: General Details Section (Port of Entry, Transportation, Type of Entry, Releasing) */}
          {isContractMode && (
            <ContractGeneralDetailsSection
              data={contractGeneralDetails}
              onChange={setContractGeneralDetails}
              viewMode={viewMode}
            />
          )}

          {/* ✨ CONTRACT: Rate Matrix Editors (shown only in contract mode) */}
          {isContractMode && builderMode === "quotation" && (
            <div style={{ marginBottom: "24px" }}>
              {selectedServices.length === 0 && !viewMode && (
                <div style={{
                  padding: "32px 24px",
                  textAlign: "center",
                  color: "var(--neuron-ink-muted)",
                  fontSize: "13px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  backgroundColor: "var(--theme-bg-surface-subtle)",
                }}>
                  Select one or more services above to configure rate cards.
                </div>
              )}
              {rateMatrices.map((matrix) => (
                <ContractRateMatrixEditor
                  key={matrix.id}
                  matrix={matrix}
                  onChange={(updated) => {
                    setRateMatrices(prev => prev.map(m => m.id === updated.id ? updated : m));
                  }}
                  viewMode={viewMode}
                />
              ))}
            </div>
          )}

          {/* Service-specific Forms — hidden in contract mode (contract scope removed) */}
          {selectedServices.includes("Brokerage") && !isContractMode && (
            <BrokerageServiceForm
              data={brokerageData}
              onChange={handleBrokerageChange}
              viewMode={viewMode}
              movement={movement}
              contractMode={isContractMode}
              headerToolbar={renderContractToolbar("Brokerage")}
            />
          )}

          {/* Forwarding — hidden in contract mode (per-shipment service only) */}
          {selectedServices.includes("Forwarding") && !isContractMode && (
            <ForwardingServiceForm
              data={forwardingData}
              onChange={handleForwardingChange}
              builderMode={builderMode}
              viewMode={viewMode}
              movement={movement}
              contractMode={isContractMode}
              headerToolbar={renderContractToolbar("Forwarding")}
            />
          )}

          {selectedServices.includes("Trucking") && !isContractMode && (
            <TruckingServiceForm
              data={truckingData}
              onChange={handleTruckingChange}
              viewMode={viewMode}
              movement={movement}
              contractMode={isContractMode}
              contractDestinations={cachedFullContract?.rate_matrices ? extractContractDestinations(cachedFullContract.rate_matrices) : undefined}
              headerToolbar={renderContractToolbar("Trucking")}
            />
          )}

          {/* Marine Insurance — hidden in contract mode (per-shipment service only) */}
          {selectedServices.includes("Marine Insurance") && !isContractMode && (
            <MarineInsuranceServiceForm
              data={marineInsuranceData}
              onChange={handleMarineInsuranceChange}
              viewMode={viewMode}
              contractMode={isContractMode}
              headerToolbar={renderContractToolbar("Marine Insurance")}
            />
          )}

          {selectedServices.includes("Others") && !isContractMode && (
            <OthersServiceForm
              data={othersData}
              onChange={setOthersData}
              viewMode={viewMode}
              contractMode={isContractMode}
              headerToolbar={renderContractToolbar("Others")}
            />
          )}

          {/* ✨ CONTRACT: Scope of Services + Terms & Conditions (shown only in contract mode) */}
          {isContractMode && builderMode === "quotation" && (
            <>
              {/* Scope of Services — free-text textarea */}
              <div style={{
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                padding: "24px",
                marginBottom: "24px",
              }}>
                <h2 style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--neuron-brand-green)",
                  margin: "0 0 16px 0",
                }}>
                  Scope of Services
                </h2>
                {viewMode ? (
                  scopeOfServices.trim() ? (
                    <div style={{
                      fontSize: "13px",
                      color: "var(--neuron-ink-primary)",
                      lineHeight: "1.7",
                      whiteSpace: "pre-line",
                    }}>
                      {scopeOfServices}
                    </div>
                  ) : (
                    <p style={{
                      fontSize: "13px",
                      color: "var(--neuron-ink-muted)",
                      fontStyle: "italic",
                      margin: 0,
                    }}>
                      No scope of services defined.
                    </p>
                  )
                ) : (
                  <textarea
                    value={scopeOfServices}
                    onChange={(e) => setScopeOfServices(e.target.value)}
                    placeholder={"Enter scope of services (one item per line)...\n\ne.g.,\nChecking accuracy of draft documents\nArranging cargo insurance\nCoordinating with shipping lines"}
                    rows={6}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      fontWeight: 400,
                      color: "var(--neuron-ink-primary)",
                      backgroundColor: "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      fontFamily: "inherit",
                      resize: "vertical",
                      lineHeight: "1.7",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                )}
              </div>

              {/* Terms & Conditions — free-text textarea */}
              <div style={{
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                padding: "24px",
                marginBottom: "24px",
              }}>
                <h2 style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--neuron-brand-green)",
                  margin: "0 0 16px 0",
                }}>
                  Terms & Conditions
                </h2>
                {viewMode ? (
                  termsAndConditions.trim() ? (
                    <div style={{
                      fontSize: "13px",
                      color: "var(--neuron-ink-primary)",
                      lineHeight: "1.7",
                      whiteSpace: "pre-line",
                    }}>
                      {termsAndConditions}
                    </div>
                  ) : (
                    <p style={{
                      fontSize: "13px",
                      color: "var(--neuron-ink-muted)",
                      fontStyle: "italic",
                      margin: 0,
                    }}>
                      No terms and conditions defined.
                    </p>
                  )
                ) : (
                  <textarea
                    value={termsAndConditions}
                    onChange={(e) => setTermsAndConditions(e.target.value)}
                    placeholder={"Enter terms and conditions (one item per line)...\n\ne.g.,\nPayment terms: 15 days upon receipt of billing\nRates are subject to change without prior notice\nAll claims must be filed within 30 days"}
                    rows={6}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      fontWeight: 400,
                      color: "var(--neuron-ink-primary)",
                      backgroundColor: "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      fontFamily: "inherit",
                      resize: "vertical",
                      lineHeight: "1.7",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                )}
              </div>
            </>
          )}

          {/* Vendors Section - Only visible in quotation mode (PD users), hidden in contract mode */}
          {builderMode === "quotation" && !isContractMode && (
            <VendorsSection
              vendors={vendors}
              setVendors={setVendors}
              onImportCharges={handleImportVendorCharges}
              viewMode={viewMode}
            />
          )}

          {/* 💰 Buying Price Section - Vendor costs (read-only), hidden in contract mode */}
          {builderMode === "quotation" && !isContractMode && (vendors.length > 0 || buyingPrice.length > 0) && (
            <div style={{ marginBottom: "24px" }}>
              <BuyingPriceSection
                categories={buyingPrice}
                onChange={setBuyingPrice}
                currency={currency}
                expandedCategories={expandedBuyingCategories}
                onToggleCategory={handleToggleBuyingCategory}
                onAddCategory={handleAddBuyingCategory}
                onAddItemToCategory={handleAddItemToBuyingCategory}
                onRenameCategory={handleRenameBuyingCategory}
                onDuplicateCategory={handleDuplicateBuyingCategory}
                onDeleteCategory={handleDeleteBuyingCategory}
                vendors={vendors}
                viewMode={viewMode}
              />
            </div>
          )}

          {/* 💵 Selling Price Section - Customer pricing with markup calculator, hidden in contract mode */}
          {builderMode === "quotation" && !isContractMode && (
            <div style={{ marginBottom: "24px" }}>
              <SellingPriceSection
                categories={sellingPrice}
                onChange={setSellingPrice}
                currency={currency}
                expandedCategories={expandedSellingCategories}
                onToggleCategory={handleToggleSellingCategory}
                onAddCategory={handleAddSellingCategory}
                onAddItemToCategory={handleAddItemToSellingCategory}
                onRenameCategory={handleRenameSellingCategory}
                onDuplicateCategory={handleDuplicateSellingCategory}
                onDeleteCategory={handleDeleteSellingCategory}
                viewMode={viewMode}
              />
            </div>
          )}

          {/* ⚠️ DEPRECATED: Charge Categories Section - HIDDEN in quotation mode */}
          {/* Replaced by Buying/Selling Price sections above */}
          {/* State management kept for backward compatibility */}
          {false && builderMode === "quotation" && (
            <ChargeCategoriesManager
              categories={chargeCategories}
              onChange={setChargeCategories}
              currency={currency}
              onCurrencyChange={setCurrency}
              mode="full"
              showQuantityField={true}
              showForexField={true}
              showTaxField={true}
              showRemarksField={true}
              title="CHARGE CATEGORIES & LINE ITEMS"
              readOnly={isLocked}
            />
          )}

          {/* Financial Summary - Only visible in quotation mode, hidden in contract mode */}
          {builderMode === "quotation" && !isContractMode && (
            <FinancialSummaryPanel
              financialSummary={financialSummary}
              currency={currency}
              taxRate={taxRate}
              setTaxRate={setTaxRate}
              otherCharges={otherCharges}
              setOtherCharges={setOtherCharges}
            />
          )}
          
          </div>
          {/* End Form Content Wrapper */}

        </div>
      </div>

      {/* ✨ Rate Breakdown Sheet — read-only slide-over for contract rate transparency */}
      {breakdownService && cachedFullContract?.rate_matrices && (
        <QuotationRateBreakdownSheet
          isOpen={!!breakdownService}
          onClose={() => setBreakdownService(null)}
          serviceType={breakdownService}
          rateMatrices={cachedFullContract.rate_matrices}
          resolvedMode={rateBridgeInfoMap[breakdownService]?.resolvedMode || null}
          quantities={getQuantitiesForService(breakdownService)}
          selections={getSelectionsForService(breakdownService)}
          truckTypeLabel={breakdownService.toLowerCase() === "trucking"
            ? (() => {
                const li = normalizeTruckingLineItems(truckingData);
                if (li.length === 1) return li[0].truckType || truckingData.truckType;
                const types = [...new Set(li.map(l => l.truckType).filter(Boolean))];
                return types.length > 0 ? types.join(", ") : truckingData.truckType;
              })()
            : undefined}
          truckingLineItems={breakdownService.toLowerCase() === "trucking"
            ? normalizeTruckingLineItems(truckingData)
            : undefined}
          currency={currency}
          contractNumber={sourceContractNumber || detectedContract?.quote_number || ""}
        />
      )}
    </div>
  );
}
