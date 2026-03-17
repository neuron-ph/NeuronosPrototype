import { useState, useEffect } from "react";
import { ArrowLeft, Building2, Award, MapPin, User, Mail, Phone, Ship, MessageSquare, Trash2, Plus, Edit, ShieldCheck, Plane, FileText } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useNetworkPartners } from "../../hooks/useNetworkPartners";
import type { NetworkPartner } from "../../data/networkPartners";
import { isExpired, formatExpiryDate, COUNTRIES } from "../../data/networkPartners";
import type { QuotationChargeCategory } from "../../types/pricing";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { ChargeCategoriesManager } from "./shared/ChargeCategoriesManager";
import { PartnerSheet } from "./partners/PartnerSheet";

// --- UNIFIED COMPONENT SYSTEM ---

interface UnifiedFieldProps {
  label: string;
  icon?: any;
  className?: string;
  children: React.ReactNode;
}

const UnifiedFieldWrapper = ({ label, icon: Icon, className = "", children }: UnifiedFieldProps) => (
  <div className={`mb-5 ${className}`}>
    <div className="flex items-center gap-2 mb-1.5">
      {Icon && <Icon size={14} className="text-[#6B7A76]" />}
      <span className="text-[11px] font-medium uppercase tracking-wide text-[#6B7A76]">
        {label}
      </span>
    </div>
    <div className="w-full text-[13px] text-[#12332B]">
      {children}
    </div>
  </div>
);

interface UnifiedTextProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

const UnifiedText = ({ value, onChange, placeholder, readOnly, className = "", prefix, suffix }: UnifiedTextProps) => {
  const baseClasses = "flex-1 px-2 py-1.5 border rounded text-[13px] transition-colors duration-200 outline-none";
  const editClasses = "bg-white border-[#E5ECE9] text-[#12332B] focus:ring-1 focus:ring-[#0F766E] placeholder-gray-400";
  const viewClasses = "bg-transparent border-transparent text-[#12332B] cursor-default px-0";

  return (
    <div className="flex items-center gap-2 w-full">
      {prefix}
      <input
        value={value || ""}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        placeholder={readOnly ? "" : placeholder}
        readOnly={readOnly}
        className={`${baseClasses} ${readOnly ? viewClasses : editClasses} ${className}`}
      />
      {suffix}
    </div>
  );
};

interface UnifiedSelectProps {
  value: any;
  onChange: (val: any) => void;
  options: { value: any; label: string }[];
  placeholder?: string;
  readOnly?: boolean;
  fullWidth?: boolean;
}

const UnifiedSelect = ({ value, onChange, options, placeholder, readOnly, fullWidth }: UnifiedSelectProps) => {
  if (readOnly) {
    const selectedOption = options.find(o => o.value === value);
    const label = selectedOption ? selectedOption.label : (value || "");
    
    // Render as a "Locked Input" that looks exactly like the dropdown
    return (
      <div className={`px-0 py-1.5 min-h-[34px] flex items-center justify-between border border-transparent bg-transparent rounded text-[13px] text-[#12332B] ${fullWidth ? 'w-full' : ''}`}>
        <span className="truncate">{label || <span className="text-gray-400 opacity-50">{placeholder}</span>}</span>
      </div>
    );
  }
  return (
    <CustomDropdown
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      fullWidth={fullWidth}
    />
  );
};

interface UnifiedDateProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

const UnifiedDate = ({ value, onChange, placeholder, readOnly }: UnifiedDateProps) => {
  if (readOnly) {
     return (
        <div className="px-0 py-1.5 min-h-[34px] flex items-center justify-between border border-transparent bg-transparent rounded text-[13px] text-[#12332B] w-full">
           <span>{value ? formatExpiryDate(value) : <span className="text-gray-400 opacity-50">{placeholder}</span>}</span>
        </div>
     );
  }
  return (
      <CustomDatePicker
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minWidth="100%"
      />
  );
};

interface UnifiedTextAreaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  rows?: number;
}

const UnifiedTextArea = ({ value, onChange, placeholder, readOnly, rows = 3 }: UnifiedTextAreaProps) => {
  const baseClasses = "w-full px-2 py-1.5 border rounded text-[13px] transition-colors duration-200 outline-none resize-none";
  const editClasses = "bg-white border-[#E5ECE9] text-[#12332B] focus:ring-1 focus:ring-[#0F766E] placeholder-gray-400";
  const viewClasses = "bg-transparent border-transparent text-[#12332B] cursor-default px-0";

  return (
     <textarea
        value={value || ""}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        placeholder={readOnly ? "" : placeholder}
        readOnly={readOnly}
        rows={rows}
        className={`${baseClasses} ${readOnly ? viewClasses : editClasses}`}
     />
  );
};

interface UnifiedTagsProps {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  readOnly?: boolean;
}

const UnifiedTags = ({ options, selected, onChange, readOnly }: UnifiedTagsProps) => {
  return (
    <div className="flex flex-wrap gap-1.5 p-1 -ml-1"> {/* Padding wrapper to prevent boundary collapse */}
      {options.map(option => {
        const isSelected = selected.includes(option);
        
        // In "Immutable Input" mode, we still show unselected options if we want strict layout match,
        // BUT typically for tags, showing all unselected in view mode is too noisy.
        // However, to keep "Exact Layout", we might want to just render them as disabled.
        // DECISION: Render all, but fade unselected significantly in View mode.
        // This guarantees the height/width of the container is identical.
        
        return (
           <button
             key={option}
             onClick={() => {
               if (readOnly) return;
               const newSelected = isSelected 
                 ? selected.filter(s => s !== option)
                 : [...selected, option];
               onChange(newSelected);
             }}
             disabled={readOnly}
             className={`px-2.5 py-1 rounded-[4px] text-[12px] border transition-all ${
               isSelected 
                 ? "bg-[#F0FDF9] border-[#0F766E] text-[#0F766E]" 
                 : readOnly 
                    ? "bg-transparent border-transparent text-gray-300" // Unselected in View Mode -> Fade out almost completely
                    : "bg-white border-[#E5ECE9] text-gray-500 hover:bg-gray-50"
             } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
           >
             {option}
           </button>
        );
      })}
      {/* If nothing selected in View Mode, show a placeholder to maintain height if we hid unselected. 
          But since we show unselected (faded), height is maintained. */}
    </div>
  );
};

// --- END UNIFIED SYSTEM ---

interface VendorDetailProps {
  vendor: NetworkPartner;
  onBack: () => void;
  onSave?: (data: Partial<NetworkPartner>) => Promise<any>;
}

export function VendorDetail({ vendor: initialVendor, onBack, onSave }: VendorDetailProps) {
  const [currentVendor, setCurrentVendor] = useState<NetworkPartner>(initialVendor);
  const [editedVendor, setEditedVendor] = useState<NetworkPartner>(initialVendor);
  const [isEditing, setIsEditing] = useState(false);
  
  // Use the hook for saving actions if onSave not provided
  const hookData = useNetworkPartners();
  const saveAction = onSave || hookData.savePartner;
  
  const [chargeCategories, setChargeCategories] = useState<QuotationChargeCategory[]>(
    initialVendor.charge_categories || []
  );
  const [currency, setCurrency] = useState<string>("USD");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false); // Kept for adding contact logic if needed, but primary edit is inline

  // Update local state if prop changes
  useEffect(() => {
    setCurrentVendor(initialVendor);
    setEditedVendor(initialVendor);
  }, [initialVendor]);

  // Load charge categories from backend on mount
  useEffect(() => {
    loadChargeCategories();
  }, [currentVendor.id]);

  // Mark as unsaved when categories change
  useEffect(() => {
    if (!isLoading) {
      setHasUnsavedChanges(true);
    }
  }, [chargeCategories]);

  const loadChargeCategories = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from('vendor_charge_categories').select('*').eq('vendor_id', currentVendor.id);

      if (!error && data) {
        setChargeCategories(data);
      } else {
        setChargeCategories(currentVendor.charge_categories || []);
      }
    } catch (error) {
      console.error("Error loading charge categories:", error);
      setChargeCategories(currentVendor.charge_categories || []);
    } finally {
      setIsLoading(false);
    }
  };

  const saveChargeCategories = async () => {
    try {
      setIsSaving(true);
      // Delete existing and re-insert
      await supabase.from('vendor_charge_categories').delete().eq('vendor_id', currentVendor.id);
      if (chargeCategories.length > 0) {
        const { error } = await supabase.from('vendor_charge_categories').insert(
          chargeCategories.map((cc: any) => ({ ...cc, vendor_id: currentVendor.id }))
        );
        if (error) throw error;
      }

      console.log(`✅ Saved ${chargeCategories.length} charge categories for vendor ${currentVendor.id}`);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Error saving charge categories:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Get service icon
  const getServiceIcon = (service: string) => {
    const serviceLower = service.toLowerCase();
    if (serviceLower.includes("ocean")) {
      return <Ship size={14} className="text-gray-500" />;
    }
    if (serviceLower.includes("air")) {
      return <Plane size={14} className="text-gray-500" />;
    }
    return <FileText size={14} className="text-gray-500" />;
  };

  const handleUpdateVendor = async (data: Partial<NetworkPartner>) => {
    try {
      const updated = { ...currentVendor, ...data };
      setCurrentVendor(updated);
      await saveAction(data);
      setIsEditSheetOpen(false);
    } catch (error) {
      console.error("Failed to update vendor", error);
    }
  };

  const handleInlineSave = async () => {
    try {
      setIsSaving(true);
      await saveAction(editedVendor);
      setCurrentVendor(editedVendor);
      setIsEditing(false);
      // toast.success("Partner updated successfully");
    } catch (error) {
      console.error("Failed to update vendor", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedVendor(currentVendor);
    setIsEditing(false);
  };

  const handleDeleteVendor = async () => {
    if (window.confirm("Are you sure you want to delete this vendor? This action cannot be undone.")) {
      try {
        if (hookData.deletePartner) {
           await hookData.deletePartner(currentVendor.id);
        }
        onBack();
      } catch (error) {
        console.error("Failed to delete vendor", error);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Top Navigation */}
      <div style={{ padding: "32px 48px 24px 48px" }}>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[13px] transition-colors text-[#0F766E] hover:text-[#0D6560]"
        >
          <ArrowLeft size={16} />
          Back to Vendors
        </button>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 overflow-hidden min-h-0" style={{ padding: "0 48px 48px 48px" }}>
        <div className="grid grid-cols-[35%_1fr] grid-rows-1 gap-8 h-full min-h-0">
          
          {/* Left Panel (35%) - Profile & Context */}
          <div className="h-full pr-1 min-h-0">
            {/* Profile Card */}
            <div className="bg-white rounded-lg border border-[#E5ECE9] overflow-hidden flex flex-col h-full">
              
              {/* Header / Identity */}
              <div className="p-6 pb-6 border-b border-[#E5ECE9] bg-white shrink-0">
                 <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                       {/* Avatar */}
                       <div className="w-16 h-16 rounded-[12px] bg-[#0F766E]/10 flex items-center justify-center text-[#0F766E] text-2xl font-bold border-2 border-[#0F766E]/20 shrink-0">
                          <Building2 size={32} />
                       </div>
                       
                       {/* Name & Status */}
                       <div>
                          <h1 className="text-[22px] font-semibold text-[#12332B] mb-2 leading-tight tracking-tight">
                            {currentVendor.company_name}
                          </h1>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                             {/* Status Badge - Solid Primary */}
                             <span className={`inline-flex items-center h-6 px-2.5 rounded text-[11px] font-medium text-white shadow-sm ${
                               isExpired(currentVendor.expires) ? "bg-[#C94F3D]" : "bg-[#0F766E]"
                             }`}>
                               {isExpired(currentVendor.expires) ? "Expired" : "Active Partner"}
                             </span>

                             {/* WCA Credential - Outlined / Special */}
                             {currentVendor.is_wca_conference && (
                               <span className="inline-flex items-center h-6 gap-1.5 px-2.5 rounded text-[11px] font-medium bg-[#0F766E]/5 text-[#0F766E] border border-[#0F766E]/20">
                                 <ShieldCheck size={12} strokeWidth={2.5} />
                                 WCA Member
                               </span>
                             )}

                             {/* Partner Type - Neutral / Ghost */}
                             {currentVendor.partner_type && (
                               <span className="inline-flex items-center h-6 px-2.5 rounded text-[11px] font-medium text-gray-600 bg-gray-100 border border-gray-200 capitalize">
                                 {currentVendor.partner_type.replace("-", " ")}
                               </span>
                             )}
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* Action Buttons */}
                 <div className="flex items-center gap-2">
                    {!isEditing ? (
                      <button
                         onClick={() => setIsEditing(true)}
                         className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px] border border-[#E5ECE9] bg-white text-[#12332B] hover:bg-[#F7FAF8]"
                      >
                         <Edit size={14} />
                         Update Details
                      </button>
                    ) : (
                      <>
                         <button 
                            onClick={handleInlineSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px] bg-[#0F766E] text-white hover:bg-[#0d6960]"
                         >
                            {isSaving ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save"
                            )}
                         </button>
                         <button 
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px] border border-[#E5ECE9] bg-white text-[#12332B] hover:bg-[#F7FAF8]"
                         >
                            Cancel
                         </button>
                      </>
                    )}
                 </div>
              </div>

              {/* Data Fields List */}
              <div className="p-6 space-y-5 bg-white flex-1 overflow-y-auto min-h-0">
                 
                 {/* Company Name (Editable here as well for completeness) */}
                 <UnifiedFieldWrapper label="Company Name" icon={Building2}>
                    <UnifiedText
                       value={isEditing ? editedVendor.company_name : currentVendor.company_name}
                       onChange={(val) => setEditedVendor({ ...editedVendor, company_name: val })}
                       readOnly={!isEditing}
                       placeholder="Company Name"
                    />
                 </UnifiedFieldWrapper>

                 {/* Partnership Expiry */}
                 <UnifiedFieldWrapper label="Partnership Expiry" icon={Award}>
                    <UnifiedDate
                       value={isEditing ? (editedVendor.expires || "") : (currentVendor.expires || "")}
                       onChange={(val) => setEditedVendor({ ...editedVendor, expires: val })}
                       placeholder="Set Expiry Date"
                       readOnly={!isEditing}
                    />
                 </UnifiedFieldWrapper>

                 {/* WCA ID - Hide if empty in view mode */}
                 {(isEditing || currentVendor.wca_id) && (
                   <UnifiedFieldWrapper label="WCA ID" icon={Award}>
                     <UnifiedText
                        value={isEditing ? (editedVendor.wca_id || "") : (currentVendor.wca_id || "")}
                        onChange={(val) => setEditedVendor({ ...editedVendor, wca_id: val })}
                        readOnly={!isEditing}
                        placeholder="Enter WCA ID"
                     />
                     
                     {/* Checkbox - Hide completely in view mode (status is in header) */}
                     {isEditing && (
                       <div className="mt-2 px-2">
                          <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editedVendor.is_wca_conference || false}
                                onChange={(e) => setEditedVendor({ ...editedVendor, is_wca_conference: e.target.checked })}
                                className="rounded border-gray-300 text-[#0F766E] focus:ring-[#0F766E] cursor-pointer"
                                id="is_wca"
                              />
                              <label htmlFor="is_wca" className="text-[12px] select-none text-gray-600 cursor-pointer">
                                WCA Conference Member
                              </label>
                          </div>
                       </div>
                     )}
                   </UnifiedFieldWrapper>
                 )}

                 {/* Partner Type */}
                 <UnifiedFieldWrapper label="Partner Type" icon={Building2}>
                    <UnifiedSelect
                      value={isEditing ? editedVendor.partner_type : currentVendor.partner_type}
                      onChange={(val) => setEditedVendor({ ...editedVendor, partner_type: val })}
                      options={[
                        { value: "international", label: "International Partner" },
                        { value: "co-loader", label: "Co-Loader" },
                        { value: "all-in", label: "All-In Partner" }
                      ]}
                      readOnly={!isEditing}
                      fullWidth
                    />
                 </UnifiedFieldWrapper>

                 {/* Location (Address, Country, City) */}
                 {(currentVendor.address || isEditing) && (
                    <UnifiedFieldWrapper label="Location & Address" icon={MapPin}>
                       <div className="space-y-3">
                         <div className="grid grid-cols-2 gap-2">
                           <UnifiedSelect
                             value={isEditing ? (editedVendor.country || "China") : (currentVendor.country || "China")}
                             onChange={(val) => setEditedVendor({ ...editedVendor, country: val })}
                             options={COUNTRIES.map(c => ({ value: c, label: c }))}
                             placeholder="Country"
                             readOnly={!isEditing}
                             fullWidth
                           />
                           <UnifiedText
                             value={isEditing ? (editedVendor.territory || "") : (currentVendor.territory || "")}
                             onChange={(val) => setEditedVendor({ ...editedVendor, territory: val })}
                             placeholder="City/Territory"
                             readOnly={!isEditing}
                           />
                         </div>
                         <UnifiedTextArea
                           value={isEditing ? (editedVendor.address || "") : (currentVendor.address || "")}
                           onChange={(val) => setEditedVendor({ ...editedVendor, address: val })}
                           placeholder="Full Address"
                           readOnly={!isEditing}
                           rows={2}
                         />
                       </div>
                    </UnifiedFieldWrapper>
                 )}

                 {/* Contact Person */}
                 <UnifiedFieldWrapper label="Primary Contact" icon={User}>
                    <UnifiedText
                      value={isEditing ? (editedVendor.contact_person || "") : (currentVendor.contact_person || "")}
                      onChange={(val) => setEditedVendor({ ...editedVendor, contact_person: val })}
                      placeholder="Contact Person Name"
                      readOnly={!isEditing}
                    />
                 </UnifiedFieldWrapper>

                 {/* Emails (Array) */}
                 {(isEditing || (currentVendor.emails && currentVendor.emails.length > 0)) && (
                    <UnifiedFieldWrapper label="Email Address" icon={Mail}>
                       <div className="space-y-2">
                          {(isEditing ? (editedVendor.emails || []) : (currentVendor.emails || [])).map((email, i) => (
                             <UnifiedText
                                key={i}
                                value={email}
                                onChange={(val) => {
                                  const newEmails = [...(editedVendor.emails || [])];
                                  newEmails[i] = val;
                                  setEditedVendor({ ...editedVendor, emails: newEmails });
                                }}
                                readOnly={!isEditing}
                                placeholder="Email Address"
                                suffix={isEditing && (
                                  <button
                                    onClick={() => {
                                      const newEmails = [...(editedVendor.emails || [])];
                                      newEmails.splice(i, 1);
                                      setEditedVendor({ ...editedVendor, emails: newEmails });
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                             />
                          ))}
                          {isEditing && (
                            <button
                              onClick={() => setEditedVendor({ ...editedVendor, emails: [...(editedVendor.emails || []), ""] })}
                              className="text-[12px] font-medium text-[#0F766E] flex items-center gap-1 hover:underline mt-1"
                            >
                              <Plus size={12} /> Add Email
                            </button>
                          )}
                       </div>
                    </UnifiedFieldWrapper>
                 )}

                 {/* Phones (Comma String treated as Array for edit) */}
                 {(isEditing || currentVendor.phone) && (
                    <UnifiedFieldWrapper label="Phone Number" icon={Phone}>
                       <div className="space-y-2">
                          {/* Logic: If editing, use editedVendor array logic. If view, split phone string. 
                              For simplicity, we'll normalize both to array on render.
                          */}
                          {(() => {
                             const phones = isEditing 
                                ? (editedVendor.phone ? editedVendor.phone.split(',').map(p => p.trim()) : [""])
                                : (currentVendor.phone ? currentVendor.phone.split(',').map(p => p.trim()) : []);
                             
                             return phones.map((phoneVal, i) => (
                                <UnifiedText
                                   key={i}
                                   value={phoneVal}
                                   onChange={(val) => {
                                      // We need to reconstruct the full string from the array
                                      const newPhones = [...phones];
                                      newPhones[i] = val;
                                      setEditedVendor({ ...editedVendor, phone: newPhones.filter(p => p).join(', ') });
                                   }}
                                   readOnly={!isEditing}
                                   placeholder="Phone Number"
                                   suffix={isEditing && phones.length > 1 && (
                                      <button
                                        onClick={() => {
                                           const newPhones = [...phones];
                                           newPhones.splice(i, 1);
                                           setEditedVendor({ ...editedVendor, phone: newPhones.join(', ') });
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                   )}
                                />
                             ));
                          })()}
                          {isEditing && (
                            <button
                              onClick={() => {
                                const currentArr = editedVendor.phone ? editedVendor.phone.split(',').map(p => p.trim()) : [];
                                setEditedVendor({ ...editedVendor, phone: [...currentArr, ""].join(', ') });
                              }}
                              className="text-[12px] font-medium text-[#0F766E] flex items-center gap-1 hover:underline mt-1"
                            >
                              <Plus size={12} /> Add Phone
                            </button>
                          )}
                       </div>
                    </UnifiedFieldWrapper>
                 )}

                 {/* Services */}
                 {(isEditing || (currentVendor.services && currentVendor.services.length > 0)) && (
                    <UnifiedFieldWrapper label="Services Offered" icon={Ship}>
                       <UnifiedTags
                          options={["Ocean Freight", "Air Freight", "Rail", "Trucking", "Warehousing", "Customs Brokerage"]}
                          selected={isEditing ? (editedVendor.services || []) : (currentVendor.services || [])}
                          onChange={(val) => setEditedVendor({ ...editedVendor, services: val })}
                          readOnly={!isEditing}
                       />
                    </UnifiedFieldWrapper>
                 )}
                 
                 {/* Notes */}
                 {(currentVendor.notes || isEditing) && (
                    <UnifiedFieldWrapper label="Notes" icon={MessageSquare}>
                       <UnifiedTextArea
                          value={isEditing ? (editedVendor.notes || "") : (currentVendor.notes || "")}
                          onChange={(val) => setEditedVendor({ ...editedVendor, notes: val })}
                          placeholder="Internal notes..."
                          readOnly={!isEditing}
                          rows={3}
                       />
                    </UnifiedFieldWrapper>
                 )}

                 {/* Delete Section */}
                 <div className="pt-6 mt-8 border-t border-[#E5ECE9] pb-2">
                   <button 
                      onClick={handleDeleteVendor}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#FEE2E2] text-[#DC2626] bg-white hover:bg-[#FEF2F2] transition-colors text-[13px] font-medium group"
                   >
                      <Trash2 size={14} className="text-[#DC2626] group-hover:text-[#B91C1C]" />
                      Delete Vendor
                   </button>
                 </div>

              </div>
            </div>
          </div>

          {/* Right Panel (Rest) - Rate Workspace */}
          <div className="h-full flex flex-col bg-white rounded-lg border border-[#E5ECE9] overflow-hidden">
             {/* Workspace Header */}
             <div className="px-6 py-4 border-b border-[#E5ECE9] flex justify-between items-center bg-white shrink-0">
                <div>
                  <h2 className="text-[18px] font-bold text-[#12332B] tracking-[-0.01em]">Standard Rate Card</h2>
                  <p className="text-[13px] text-[#6B7A76] mt-0.5">Manage standard charges and rates</p>
                </div>

                {/* Save Action */}
                {hasUnsavedChanges && (
                  <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                    <span className="text-[12px] font-medium text-[#F59E0B] flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                       <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                       Unsaved Changes
                    </span>
                    <button
                      onClick={saveChargeCategories}
                      disabled={isSaving}
                      className="px-4 py-2 bg-[#0F766E] text-white rounded-[6px] text-[13px] font-medium hover:bg-[#0d6960] transition-all shadow-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>Save Changes</>
                      )}
                    </button>
                  </div>
                )}
             </div>

             {/* Workspace Content */}
             <div className="flex-1 overflow-hidden relative bg-white">
                {isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                    <div className="text-sm text-gray-400 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-[#0F766E] rounded-full animate-spin"></div>
                      Loading rates...
                    </div>
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto p-6">
                    <ChargeCategoriesManager
                      categories={chargeCategories}
                      onChange={setChargeCategories}
                      currency={currency}
                      onCurrencyChange={setCurrency}
                      mode="simplified"
                      title="" 
                      showCurrencySelector={true}
                    />
                    
                    {/* Empty State / Prompt if no categories */}
                    {chargeCategories.length === 0 && (
                      <div className="mt-8 text-center p-8 border-2 border-dashed border-gray-100 rounded-lg">
                        <p className="text-gray-400 text-sm">No rate categories defined yet.</p>
                        <p className="text-gray-300 text-xs mt-1">Use the "Add Category" button above to start.</p>
                      </div>
                    )}
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>

      <PartnerSheet
        isOpen={isEditSheetOpen}
        onClose={() => setIsEditSheetOpen(false)}
        initialData={currentVendor}
        onSave={handleUpdateVendor}
      />
    </div>
  );
}