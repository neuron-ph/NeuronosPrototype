import { Plus, X, Building2, Download, User, MapPin, ChevronDown, Loader } from "lucide-react";
import { useState } from "react";
import type { Vendor, VendorType, ServiceType, QuotationChargeCategory } from "../../../types/pricing";
import type { VendorLineItem } from "../../../data/networkPartners"; // ⚠️ DEPRECATED - kept for backward compatibility
import { NETWORK_PARTNERS, COUNTRIES } from "../../../data/networkPartners";
import { FormSelect } from "./FormSelect";
import { supabase } from "../../../utils/supabase/client";
import { ChargeCategoriesManager } from "../shared/ChargeCategoriesManager";
import { toast } from "sonner";
import {
  createSupabaseCatalogSyncClient,
  syncChargeCategoriesToCatalog,
} from "../../../utils/pricing/catalogSync";
import {
  fetchVendorChargeCategories,
  saveVendorChargeCategories,
} from "../../../utils/pricing/vendorRateCards";
import { NeuronModal } from "../../ui/NeuronModal";

/**
 * 🎯 VENDORS SECTION - INLINE RATE MANAGEMENT
 * 
 * This component manages vendors in quotations with full inline rate card management.
 * Users can add vendors, expand them to view/edit rates, save to backend, and import to buying price.
 * 
 * KEY FEATURES:
 * ✅ Expand/collapse vendor cards with keyboard support (Space/Enter)
 * ✅ Auto-fetch vendor rates from backend on expand (with caching)
 * ✅ Full inline rate editing using ChargeCategoriesManager
 * ✅ Unsaved changes tracking with warning on collapse
 * ✅ Save & Import workflow (saves to backend + imports to buying price)
 * ✅ Smart button states ("Add Rates & Import" vs "Import Rates")
 * ✅ Smooth animations and ARIA accessibility
 * ✅ Per-vendor currency support
 * 
 * STATE ARCHITECTURE:
 * - expandedVendorIds: Set<string> - Tracks which vendors are expanded
 * - vendorRatesCache: Map<vendorId, rates[]> - Cached rates from backend
 * - loadingVendorRates: Set<string> - Tracks loading state per vendor
 * - vendorCurrencies: Map<vendorId, currency> - Per-vendor currency selection
 * - hasUnsavedChanges: Map<vendorId, boolean> - Tracks unsaved edits
 * - originalVendorRates: Map<vendorId, rates[]> - Original rates for change detection
 * - savingVendorId: string | null - Tracks which vendor is being saved
 * 
 * WORKFLOW:
 * 1. User adds vendor → Card appears with "Add Rates" or "Import Rates" button
 * 2. Click to expand → Fetches rates from backend (if not cached)
 * 3. Edit rates inline → Unsaved changes indicator appears
 * 4. Click "Save & Import" → Saves to backend + imports to buying price
 * 5. Success toast → Rates appear in buying price section
 * 
 * IMPLEMENTATION: See /VENDOR_INLINE_RATES_BLUEPRINT.md for full details
 * COMPLETION: 100% (8/8 phases complete)
 * LAST UPDATED: 2026-01-25
 */

// Convert NETWORK_PARTNERS to vendor options
const VENDOR_MASTERLIST = NETWORK_PARTNERS.map(partner => ({
  value: partner.id,
  label: partner.company_name,
  country: partner.country,
  // Default to "international" if partner_type is missing (for backwards compatibility)
  partner_type: partner.partner_type || "international",
  // Support both old and new formats
  charge_categories: partner.charge_categories,
  line_items: partner.line_items || []
}));

function isChargeCategoryData(data: QuotationChargeCategory[] | VendorLineItem[]): data is QuotationChargeCategory[] {
  return data.length > 0 && "line_items" in data[0];
}

interface VendorsSectionProps {
  vendors: Vendor[];
  setVendors: (vendors: Vendor[]) => void;
  // Updated to accept both old and new formats
  onImportCharges?: (vendorId: string, vendorName: string, data: VendorLineItem[] | QuotationChargeCategory[], vendorServiceTag?: string) => void;
  viewMode?: boolean; // When true, hides action buttons and renders read-only
}

export function VendorsSection({ vendors, setVendors, onImportCharges, viewMode = false }: VendorsSectionProps) {
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorType, setNewVendorType] = useState<string>("International Partners");
  const [newVendorCountry, setNewVendorCountry] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorServiceTag, setNewVendorServiceTag] = useState("");
  const [isAddVendorHovered, setIsAddVendorHovered] = useState(false);
  
  // ✨ PHASE 1: Expand/Collapse Infrastructure
  const [expandedVendorIds, setExpandedVendorIds] = useState<Set<string>>(new Set());
  
  // ✨ PHASE 2: Backend Rate Fetching
  const [vendorRatesCache, setVendorRatesCache] = useState<Map<string, QuotationChargeCategory[]>>(new Map());
  const [loadingVendorRates, setLoadingVendorRates] = useState<Set<string>>(new Set());
  
  // ✨ PHASE 3: Inline Rate Card Display
  const [vendorCurrencies, setVendorCurrencies] = useState<Map<string, string>>(new Map());
  
  // ✨ PHASE 4: Inline Editing Functionality
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<Map<string, boolean>>(new Map());
  const [originalVendorRates, setOriginalVendorRates] = useState<Map<string, QuotationChargeCategory[]>>(new Map());
  
  // ✨ PHASE 5: Save & Import Workflow
  const [savingVendorId, setSavingVendorId] = useState<string | null>(null);
  const [pendingCollapseVendorId, setPendingCollapseVendorId] = useState<string | null>(null);
  
  // ✨ PHASE 1: Toggle vendor expansion
  const toggleVendorExpansion = (vendorId: string) => {
    const isCurrentlyExpanded = expandedVendorIds.has(vendorId);
    
    // ✨ PHASE 7: Warn user if collapsing with unsaved changes
    if (isCurrentlyExpanded && hasUnsavedChanges.get(vendorId)) {
      setPendingCollapseVendorId(vendorId);
      return;
    }

    setExpandedVendorIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(vendorId)) {
        newSet.delete(vendorId);
      } else {
        newSet.add(vendorId);
      }
      return newSet;
    });
    
    // ✅ FIX: Trigger fetch when expanding (if not already cached/loading)
    if (!isCurrentlyExpanded && !vendorRatesCache.has(vendorId) && !loadingVendorRates.has(vendorId)) {
      const vendor = vendors.find(v => v.id === vendorId);
      if (vendor) {
        fetchVendorRatesOnExpand(vendorId, vendor.vendor_id);
      }
    }
  };
  
  // ✨ PHASE 2: Fetch vendor rates from backend
  const fetchVendorRatesOnExpand = async (vendorId: string, vendorBackendId?: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) return;
    
    // Check if already cached
    if (vendorRatesCache.has(vendorId)) {
      console.log(`📦 Using cached rates for ${vendor.name}`);
      return;
    }
    
    // Check if already loading
    if (loadingVendorRates.has(vendorId)) {
      console.log(`⏳ Already loading rates for ${vendor.name}`);
      return;
    }
    
    // Start loading
    setLoadingVendorRates(prev => new Set(prev).add(vendorId));
    
    let fetchedRates: QuotationChargeCategory[] = [];
    
    // Try to fetch from backend if vendor has vendor_id
    if (vendorBackendId) {
      try {
        console.log(`🌐 Fetching rates from backend for ${vendor.name}...`);
        const ccData = await fetchVendorChargeCategories(supabase, vendorBackendId);
        
        if (ccData.length > 0) {
          fetchedRates = ccData;
          console.log(`✅ Fetched ${fetchedRates.length} categories from backend for ${vendor.name}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch rates for ${vendor.name}:`, error);
      }
    }
    
    // Fallback to hardcoded data if backend fetch failed or returned empty
    if (fetchedRates.length === 0) {
      if (vendor.charge_categories && vendor.charge_categories.length > 0) {
        fetchedRates = vendor.charge_categories;
        console.log(`📋 Using hardcoded charge_categories for ${vendor.name} (${fetchedRates.length} categories)`);
      } else if (vendor.line_items && vendor.line_items.length > 0) {
        // Convert old line_items format to charge_categories if needed
        // For now, just note that we have line_items
        console.log(`📋 Vendor ${vendor.name} has old line_items format (${vendor.line_items.length} items)`);
      } else {
        console.log(`ℹ️ No rates found for ${vendor.name} - will show empty state`);
      }
    }
    
    // Cache the results (even if empty)
    setVendorRatesCache(prev => new Map(prev).set(vendorId, fetchedRates));
    
    // ✨ PHASE 4: Store original rates for change detection
    setOriginalVendorRates(prev => new Map(prev).set(vendorId, JSON.parse(JSON.stringify(fetchedRates))));
    
    // Stop loading
    setLoadingVendorRates(prev => {
      const newSet = new Set(prev);
      newSet.delete(vendorId);
      return newSet;
    });
  };

  // Filter vendors based on type and country
  const getFilteredVendors = () => {
    let filtered = VENDOR_MASTERLIST;
    
    // Map UI vendor types to data partner types
    if (newVendorType === "International Partners") {
      filtered = filtered.filter(v => v.partner_type === "international");
      
      // Further filter by country if selected
      if (newVendorCountry) {
        filtered = filtered.filter(v => v.country === newVendorCountry);
      }
    } else if (newVendorType === "Co-Loader Partners") {
      filtered = filtered.filter(v => v.partner_type === "co-loader");
    } else if (newVendorType === "All-In Partners") {
      filtered = filtered.filter(v => v.partner_type === "all-in");
    }
    
    return filtered;
  };

  const filteredVendors = getFilteredVendors();

  const handleAddVendor = () => {
    if (newVendorName.trim()) {
      // Find the vendor label from the masterlist
      const selectedVendor = VENDOR_MASTERLIST.find(v => v.value === newVendorName);
      const vendorDisplayName = selectedVendor ? selectedVendor.label : newVendorName;
      
      const newVendor: Vendor = {
        id: `vendor-${Date.now()}`,
        type: newVendorType as VendorType,
        name: vendorDisplayName,
        service_tag: (newVendorServiceTag || undefined) as any,
        vendor_id: selectedVendor ? selectedVendor.value : undefined,
        // Support both old and new formats
        charge_categories: selectedVendor ? selectedVendor.charge_categories : undefined,
        line_items: selectedVendor ? selectedVendor.line_items : []
      };
      setVendors([...vendors, newVendor]);
      setNewVendorName("");
      setNewVendorCountry("");
      setNewVendorServiceTag("");
      setShowAddVendor(false);
    }
  };

  // Reset country and vendor name when type changes
  const handleTypeChange = (value: string) => {
    setNewVendorType(value);
    setNewVendorCountry("");
    setNewVendorName("");
  };

  // Reset vendor name when country changes
  const handleCountryChange = (value: string) => {
    setNewVendorCountry(value);
    setNewVendorName("");
  };

  const handleRemoveVendor = (vendorId: string) => {
    setVendors(vendors.filter(v => v.id !== vendorId));
  };

  const handleImportCharges = async (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (vendor && onImportCharges) {
      // ✅ PHASE 5: Fetch from backend first (live data), fallback to hardcoded
      let data: QuotationChargeCategory[] | VendorLineItem[] | undefined;
      
      // Try to fetch live vendor data from backend
      if (vendor.vendor_id) {
        try {
          const ccData = await fetchVendorChargeCategories(supabase, vendor.vendor_id);
          if (ccData.length > 0) {
            data = ccData;
            console.log(`✅ Imported live charge categories from backend for vendor ${vendor.name}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to fetch live vendor data, using fallback:`, error);
        }
      }
      
      // Fallback to embedded data if backend fetch failed or no vendor_id
      if (!data || data.length === 0) {
        data = vendor.charge_categories || vendor.line_items;
        console.log(`⚠️ Using hardcoded fallback data for vendor ${vendor.name}`);
      }
      
      // Import if we have data
      if (data && data.length > 0) {
        let dataToImport = data;

        if (isChargeCategoryData(data)) {
          dataToImport = await syncChargeCategoriesToCatalog(data, createSupabaseCatalogSyncClient(), { side: "revenue" });
          setVendorRatesCache(prev => new Map(prev).set(vendorId, dataToImport as QuotationChargeCategory[]));
        }

        onImportCharges(vendor.vendor_id || vendorId, vendor.name || "Unknown Vendor", dataToImport, vendor.service_tag);
      }
    }
  };

  // ✨ PHASE 5: Save vendor rates to backend and import to buying price
  const handleSaveAndImport = async (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) return;
    
    const cachedRates = vendorRatesCache.get(vendorId) || [];
    if (cachedRates.length === 0) {
      toast.error("No rates to save and import");
      return;
    }
    
    // Must have vendor_id to save to backend
    if (!vendor.vendor_id) {
      toast.error("Vendor ID not found. Cannot save to backend.");
      return;
    }
    
    console.log(`💾 Saving and importing rates for ${vendor.name}...`);
    setSavingVendorId(vendorId);
    
    try {
      const syncedRates = await syncChargeCategoriesToCatalog(
        cachedRates,
        createSupabaseCatalogSyncClient(),
        { side: "revenue" }
      );

      // Step 1: Save to backend on the unified service provider record
      await saveVendorChargeCategories(supabase, {
        vendorId: vendor.vendor_id,
        vendorName: vendor.name,
        vendorType: vendor.type,
        categories: syncedRates,
      });
      console.log(`✅ Saved ${syncedRates.length} categories to backend for ${vendor.name}`);

      setVendorRatesCache(prev => new Map(prev).set(vendorId, syncedRates));
      
      // Step 2: Update originalVendorRates to reflect saved state
      setOriginalVendorRates(prev => new Map(prev).set(vendorId, JSON.parse(JSON.stringify(syncedRates))));
      
      // Step 3: Clear unsaved changes indicator
      setHasUnsavedChanges(prev => new Map(prev).set(vendorId, false));
      
      // Step 4: Import to buying price (use existing function)
      if (onImportCharges) {
        onImportCharges(vendor.vendor_id, vendor.name || "Unknown Vendor", syncedRates, vendor.service_tag);
        console.log(`✅ Imported rates to buying price for ${vendor.name}`);
      }
      
      // Step 5: Show success feedback
      toast.success(`Rates saved and imported for ${vendor.name}`);
      
    } catch (error) {
      console.error(`❌ Failed to save rates for ${vendor.name}:`, error);
      toast.error(`Failed to save rates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSavingVendorId(null);
    }
  };

  const handleDiscardAndCollapse = () => {
    if (!pendingCollapseVendorId) return;
    const vendorOriginal = originalVendorRates.get(pendingCollapseVendorId);
    if (vendorOriginal) {
      setVendorRatesCache(prev => new Map(prev).set(pendingCollapseVendorId, JSON.parse(JSON.stringify(vendorOriginal))));
    }
    setHasUnsavedChanges(prev => new Map(prev).set(pendingCollapseVendorId, false));
    setExpandedVendorIds(prev => {
      const next = new Set(prev);
      next.delete(pendingCollapseVendorId);
      return next;
    });
    setPendingCollapseVendorId(null);
  };

  return (
    <div style={{
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--neuron-brand-green)",
          margin: 0
        }}>
          Vendors
        </h2>
        {/* Hide Add Vendor button in view mode */}
        {!viewMode && (
        <button
          type="button"
          onClick={() => setShowAddVendor(!showAddVendor)}
          style={{
            padding: "8px 14px",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--neuron-brand-green)",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.2s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
            e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
            e.currentTarget.style.transform = "translateY(-1px)";
            setIsAddVendorHovered(true);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
            e.currentTarget.style.borderColor = "var(--theme-border-default)";
            e.currentTarget.style.transform = "translateY(0)";
            setIsAddVendorHovered(false);
          }}
        >
          <Plus size={16} />
          Add Vendor
        </button>
        )}
      </div>

      {/* Add Vendor Form */}
      {showAddVendor && (
        <div style={{
          padding: "16px",
          backgroundColor: "var(--theme-bg-surface-subtle)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "6px",
          marginBottom: "12px"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Type and Country Row */}
            <div style={{ display: "grid", gridTemplateColumns: newVendorType === "International Partners" ? "1fr 1fr" : "1fr", gap: "12px" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "6px"
                }}>
                  Type
                </label>
                <FormSelect
                  value={newVendorType}
                  onChange={handleTypeChange}
                  options={[
                    { value: "International Partners", label: "International Partners" },
                    { value: "Co-Loader Partners", label: "Co-Loader Partners" },
                    { value: "All-In Partners", label: "All-In Partners" }
                  ]}
                  placeholder="Select type..."
                />
              </div>

              {/* Country - Only show for International Partners */}
              {newVendorType === "International Partners" && (
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "6px"
                  }}>
                    Country
                  </label>
                  <FormSelect
                    value={newVendorCountry}
                    onChange={handleCountryChange}
                    options={COUNTRIES.map(country => ({ value: country, label: country }))}
                    placeholder="Select country..."
                  />
                </div>
              )}
            </div>

            {/* Vendor Name and Add Button Row */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "6px"
                }}>
                  Vendor Name
                </label>
                <FormSelect
                  value={newVendorName}
                  onChange={(value) => setNewVendorName(value)}
                  options={filteredVendors}
                  placeholder="Select vendor..."
                />
              </div>
              
              <div>
                <label style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "6px"
                }}>
                  Service
                </label>
                <FormSelect
                  value={newVendorServiceTag}
                  onChange={(value) => setNewVendorServiceTag(value)}
                  options={[
                    { value: "Forwarding", label: "Forwarding" },
                    { value: "Brokerage", label: "Brokerage" },
                    { value: "Trucking", label: "Trucking" },
                    { value: "Marine Insurance", label: "Marine Insurance" },
                    { value: "Others", label: "Others" }
                  ]}
                  placeholder="General"
                />
              </div>

              <button
                type="button"
                onClick={handleAddVendor}
                disabled={!newVendorName.trim()}
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "white",
                  backgroundColor: newVendorName.trim() ? "#0F766E" : "var(--theme-border-default)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: newVendorName.trim() ? "pointer" : "not-allowed"
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendors List */}
      {vendors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {vendors.map(vendor => {
            const isExpanded = expandedVendorIds.has(vendor.id);
            const isLoading = loadingVendorRates.has(vendor.id);
            const cachedRates = vendorRatesCache.get(vendor.id) || [];
            
            // Check if vendor has rates (from cache, hardcoded, or backend)
            const hasRatesInCache = cachedRates && cachedRates.length > 0;
            const hasHardcodedRates = (vendor.charge_categories && vendor.charge_categories.length > 0) || 
                                      (vendor.line_items && vendor.line_items.length > 0);
            const hasAnyRates = hasRatesInCache || hasHardcodedRates;
            
            return (
            <div key={vendor.id}>
              {/* ✨ COMPACT HEADER - Single line with all controls */}
              <div
                style={{
                  padding: "12px 16px",
                  backgroundColor: "var(--theme-bg-surface-subtle)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  transition: "all 0.2s ease"
                }}
              >
                {/* LEFT SIDE: Chevron + Name + Badge + Meta */}
                <div 
                  onClick={() => toggleVendorExpansion(vendor.id)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggleVendorExpansion(vendor.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} vendor ${vendor.name}`}
                  style={{ 
                    flex: 1, 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "10px",
                    cursor: "pointer",
                    outline: "none",
                    minWidth: 0 // Allow flex shrink
                  }}
                  onFocus={(e) => {
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.style.borderColor = "var(--neuron-brand-teal)";
                      parent.style.boxShadow = "0 0 0 2px rgba(15, 118, 110, 0.1)";
                    }
                  }}
                  onBlur={(e) => {
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.style.borderColor = "var(--neuron-ui-border)";
                      parent.style.boxShadow = "none";
                    }
                  }}
                >
                  {/* Chevron */}
                  <ChevronDown 
                    size={16}
                    style={{
                      color: "var(--neuron-ink-muted)",
                      transition: "transform 0.2s ease",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      flexShrink: 0
                    }}
                  />
                  
                  {/* Vendor Name */}
                  <span style={{ 
                    fontSize: "13px", 
                    fontWeight: 500, 
                    color: "var(--neuron-ink-base)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}>
                    {vendor.name}
                  </span>
                  
                  {/* Service Tag Badge */}
                  {vendor.service_tag && (
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "var(--neuron-brand-teal)",
                      backgroundColor: "var(--theme-bg-surface-tint)",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      flexShrink: 0
                    }}>
                      {vendor.service_tag}
                    </span>
                  )}
                  
                  {/* Metadata - Only show when collapsed */}
                  {!isExpanded && (
                    <span style={{ 
                      fontSize: "12px", 
                      color: "var(--neuron-ink-muted)",
                      whiteSpace: "nowrap"
                    }}>
                      • {vendor.type}
                      {hasAnyRates && (
                        <>
                          {' • '}{cachedRates.length || vendor.charge_categories?.length || 0} {(cachedRates.length || vendor.charge_categories?.length || 0) === 1 ? 'category' : 'categories'}
                          {' • '}{cachedRates.reduce((sum, cat) => sum + (cat.line_items?.length || 0), 0) || vendor.charge_categories?.reduce((sum, cat) => sum + (cat.line_items?.length || 0), 0) || 0} items
                        </>
                      )}
                    </span>
                  )}
                </div>
                
                {/* RIGHT SIDE: Action Buttons - Hidden in View Mode */}
                {!viewMode && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  {isExpanded ? (
                    // ✨ EXPANDED: Show editing controls
                    <>
                      {/* Currency Selector */}
                      <select
                        value={vendorCurrencies.get(vendor.id) || "USD"}
                        onChange={(e) => {
                          setVendorCurrencies(prev => new Map(prev).set(vendor.id, e.target.value));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "var(--neuron-ink-base)",
                          backgroundColor: "var(--theme-bg-surface)",
                          border: "1px solid var(--neuron-ui-border)",
                          borderRadius: "4px",
                          cursor: "pointer",
                          outline: "none"
                        }}
                      >
                        <option value="USD">USD</option>
                        <option value="PHP">PHP</option>
                        <option value="EUR">EUR</option>
                        <option value="CNY">CNY</option>
                      </select>
                      
                      {/* Unsaved Changes Indicator */}
                      {hasUnsavedChanges.get(vendor.id) && (
                        <span style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11px",
                          fontWeight: 500,
                          color: "var(--neuron-semantic-warn)",
                          backgroundColor: "var(--neuron-semantic-warn-bg)",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          border: "1px solid var(--theme-status-warning-border)",
                          whiteSpace: "nowrap"
                        }}>
                          <span style={{
                            display: "inline-block",
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "var(--neuron-semantic-warn)"
                          }}></span>
                          Unsaved
                        </span>
                      )}
                      
                      {/* Save & Import Button */}
                      {vendor.vendor_id && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveAndImport(vendor.id);
                          }}
                          disabled={savingVendorId === vendor.id}
                          style={{
                            padding: "6px 12px",
                            color: "white",
                            backgroundColor: savingVendorId === vendor.id ? "#A7D7D3" : "#0F766E",
                            border: "none",
                            borderRadius: "4px",
                            cursor: savingVendorId === vendor.id ? "wait" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            transition: "all 0.15s ease",
                            whiteSpace: "nowrap"
                          }}
                          onMouseEnter={(e) => {
                            if (savingVendorId !== vendor.id) {
                              e.currentTarget.style.backgroundColor = "#0D6A62";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (savingVendorId !== vendor.id) {
                              e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                            }
                          }}
                        >
                          {savingVendorId === vendor.id ? (
                            <Loader
                              size={14}
                              style={{
                                color: "white",
                                animation: "spin 1s linear infinite"
                              }}
                            />
                          ) : (
                            <Download size={14} />
                          )}
                          Save & Import
                        </button>
                      )}
                    </>
                  ) : (
                    // ✨ COLLAPSED: Show import button
                    <>
                      {hasAnyRates ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleImportCharges(vendor.id);
                          }}
                          title="Import vendor's standard rate card"
                          style={{
                            padding: "6px 12px",
                            color: "var(--neuron-brand-teal)",
                            backgroundColor: "var(--theme-bg-surface)",
                            border: "1px solid var(--neuron-ui-border)",
                            borderRadius: "4px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            transition: "all 0.15s ease",
                            whiteSpace: "nowrap"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                            e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                          }}
                        >
                          <Download size={14} />
                          Import Rates
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedVendorIds(prev => {
                              const newSet = new Set(prev);
                              newSet.add(vendor.id);
                              return newSet;
                            });
                            if (!vendorRatesCache.has(vendor.id) && !loadingVendorRates.has(vendor.id)) {
                              fetchVendorRatesOnExpand(vendor.id, vendor.vendor_id);
                            }
                          }}
                          title="Add rate card for this vendor"
                          style={{
                            padding: "6px 12px",
                            color: "var(--neuron-ink-muted)",
                            backgroundColor: "var(--theme-bg-surface)",
                            border: "1px solid var(--neuron-ui-border)",
                            borderRadius: "4px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            transition: "all 0.15s ease",
                            whiteSpace: "nowrap"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                            e.currentTarget.style.borderColor = "var(--theme-border-default)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                          }}
                        >
                          <Plus size={14} />
                          Add Rates & Import
                        </button>
                      )}
                    </>
                  )}
                  
                  {/* Remove Button - hide in view mode */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveVendor(vendor.id);
                    }}
                    style={{
                      padding: "6px",
                      color: "var(--neuron-ink-muted)",
                      backgroundColor: "transparent",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 0.15s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
                      e.currentTarget.style.color = "var(--theme-status-danger-fg)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--neuron-ink-muted)";
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                )}
              </div>

              {/* ✨ EXPANDED CONTENT - Direct category list, no redundant header */}
              {isExpanded && (
                <div style={{
                  marginTop: "8px",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  animation: "expandIn 0.2s ease-out",
                  transformOrigin: "top"
                }}>
                  {isLoading ? (
                    // Loading State
                    <div style={{
                      padding: "32px",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "12px"
                    }}>
                      <Loader
                        size={24}
                        style={{
                          color: "var(--neuron-brand-teal)",
                          animation: "spin 1s linear infinite"
                        }}
                      />
                      <div style={{
                        fontSize: "13px",
                        color: "var(--neuron-ink-muted)"
                      }}>
                        Loading vendor rates...
                      </div>
                    </div>
                  ) : (
                    // Rate Card Content - Direct, no header
                    <ChargeCategoriesManager
                      categories={cachedRates}
                      onChange={(updatedCategories) => {
                        console.log("📝 Categories changed for vendor:", vendor.name, updatedCategories);
                        setVendorRatesCache(prev => new Map(prev).set(vendor.id, updatedCategories));
                        
                        const originalRates = originalVendorRates.get(vendor.id) || [];
                        const hasChanges = JSON.stringify(updatedCategories) !== JSON.stringify(originalRates);
                        setHasUnsavedChanges(prev => new Map(prev).set(vendor.id, hasChanges));
                        
                        if (hasChanges) {
                          console.log("⚠️ Unsaved changes detected for vendor:", vendor.name);
                        } else {
                          console.log("✅ Changes reverted to original for vendor:", vendor.name);
                        }
                      }}
                      currency={vendorCurrencies.get(vendor.id) || "USD"}
                      onCurrencyChange={(newCurrency) => {
                        console.log("💱 Currency changed for vendor:", vendor.name, newCurrency);
                        setVendorCurrencies(prev => new Map(prev).set(vendor.id, newCurrency));
                      }}
                      mode="simplified"
                      showQuantityField={false}
                      showForexField={false}
                      showTaxField={false}
                      showRemarksField={true}
                      title=""
                      readOnly={viewMode}
                      showCurrencySelector={false}
                    />
                  )}
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}

      {vendors.length === 0 && !showAddVendor && (
        <div style={{
          padding: "24px",
          textAlign: "center",
          color: "var(--neuron-ink-muted)",
          fontSize: "13px",
          backgroundColor: "var(--theme-bg-surface-subtle)",
          border: "1px dashed var(--neuron-ui-border)",
          borderRadius: "6px"
        }}>
          No vendors added yet
        </div>
      )}

      <NeuronModal
        isOpen={!!pendingCollapseVendorId}
        onClose={() => setPendingCollapseVendorId(null)}
        title="Discard unsaved changes?"
        description="If you collapse this vendor, your unsaved rate changes will be lost."
        confirmLabel="Discard & Collapse"
        onConfirm={handleDiscardAndCollapse}
        variant="warning"
      />
    </div>
  );
}
