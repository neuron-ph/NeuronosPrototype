import { X, Building2, MapPin, User, Globe, Calendar, CheckSquare, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { NetworkPartner, COUNTRIES } from "../../../data/networkPartners";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CustomDatePicker } from "../../common/CustomDatePicker";

interface PartnerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: NetworkPartner;
  onSave: (data: Partial<NetworkPartner>) => void;
}

type PartnerFormData = {
  company_name: string;
  partner_type: "international" | "co-loader" | "all-in";
  wca_id: string;
  country: string;
  territory: string;
  address: string;
  contact_person: string;
  emails: { value: string }[];
  phones: { value: string }[];
  mobiles: { value: string }[];
  website: string;
  expires: string;
  services: string[];
  notes: string;
  is_wca_conference: boolean;
};

const SERVICE_OPTIONS = [
  "Ocean Freight",
  "Air Freight",
  "Rail",
  "Trucking",
  "Warehousing",
  "Customs Brokerage"
];

export function PartnerSheet({ isOpen, onClose, initialData, onSave }: PartnerSheetProps) {
  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<PartnerFormData>({
    defaultValues: {
      company_name: "",
      partner_type: "international",
      wca_id: "",
      country: "China",
      territory: "",
      address: "",
      contact_person: "",
      emails: [{ value: "" }],
      phones: [{ value: "" }],
      mobiles: [{ value: "" }],
      website: "",
      expires: "",
      services: [],
      notes: "",
      is_wca_conference: false
    }
  });

  const { fields: emailFields, append: appendEmail, remove: removeEmail } = useFieldArray({
    control,
    name: "emails"
  });

  const { fields: phoneFields, append: appendPhone, remove: removePhone } = useFieldArray({
    control,
    name: "phones"
  });

  const { fields: mobileFields, append: appendMobile, remove: removeMobile } = useFieldArray({
    control,
    name: "mobiles"
  });

  // Reset form when opening/closing or changing data
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (initialData) {
      // Parse emails
      const emails = initialData.emails && initialData.emails.length > 0
        ? initialData.emails.map(e => ({ value: e }))
        : [{ value: "" }];

      // Parse phones (handle string or string[] compatibility)
      let phones = [{ value: "" }];
      if (initialData.phone) {
         // If it's a comma separated string, split it
         phones = initialData.phone.split(",").map(p => ({ value: p.trim() }));
      }

      // Parse mobiles
      let mobiles = [{ value: "" }];
      if (initialData.mobile) {
         mobiles = initialData.mobile.split(",").map(m => ({ value: m.trim() }));
      }

      reset({
        company_name: initialData.company_name,
        partner_type: initialData.partner_type || "international",
        wca_id: initialData.wca_id || "",
        country: initialData.country,
        territory: initialData.territory || "",
        address: initialData.address || "",
        contact_person: initialData.contact_person || "",
        emails,
        phones,
        mobiles,
        website: initialData.website || "",
        expires: initialData.expires || "",
        services: initialData.services || [],
        notes: initialData.notes || "",
        is_wca_conference: initialData.is_wca_conference || false
      });
    } else {
      reset({
        company_name: "",
        partner_type: "international",
        wca_id: "",
        country: "China",
        territory: "",
        address: "",
        contact_person: "",
        emails: [{ value: "" }],
        phones: [{ value: "" }],
        mobiles: [{ value: "" }],
        website: "",
        expires: "",
        services: [],
        notes: "",
        is_wca_conference: false
      });
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, initialData, reset]);

  const onSubmit = (data: PartnerFormData) => {
    // Flatten arrays back to data model
    const emails = data.emails
      .map(e => e.value.trim())
      .filter(e => e.length > 0);
    
    // Join phones with comma
    const phone = data.phones
      .map(p => p.value.trim())
      .filter(p => p.length > 0)
      .join(", ");
      
    // Join mobiles with comma
    const mobile = data.mobiles
      .map(m => m.value.trim())
      .filter(m => m.length > 0)
      .join(", ");

    const finalData: Partial<NetworkPartner> = {
      ...data,
      emails,
      phone,
      mobile
    };
    
    // Clean up temporary form fields
    delete (finalData as any).phones;
    delete (finalData as any).mobiles;

    onSave(finalData);
    onClose();
  };

  const selectedServices = watch("services") || [];

  const toggleService = (service: string) => {
    const current = selectedServices;
    if (current.includes(service)) {
      setValue("services", current.filter(s => s !== service));
    } else {
      setValue("services", [...current, service]);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black z-40"
        onClick={onClose}
        style={{
          backdropFilter: "blur(2px)",
          backgroundColor: "rgba(18, 51, 43, 0.15)",
        }}
      />

      {/* Slide-out Panel */}
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{
          type: "spring",
          damping: 30,
          stiffness: 300,
          duration: 0.3,
        }}
        className="fixed right-0 top-0 h-full w-[600px] bg-[var(--theme-bg-surface)] shadow-2xl z-50 flex flex-col"
        style={{
          borderLeft: "1px solid var(--neuron-ui-border)",
        }}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
          {/* Header */}
          <div
            style={{
              padding: "24px 32px",
              borderBottom: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--theme-bg-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                {initialData ? "Edit Partner" : "Add New Partner"}
              </h2>
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px" }}>
                {initialData ? "Update partner details and status" : "Enter partner information to add to network"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "transparent",
                color: "var(--theme-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Content Area - Form */}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
            <div className="space-y-8">
              
              {/* SECTION 1: Company Info */}
              <div>
                <div className="flex items-center gap-2 mb-4 text-[var(--theme-action-primary-bg)]">
                  <Building2 size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wide">Company Information</h3>
                </div>
                
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                      Company Name <span className="text-[var(--theme-status-danger-fg)]">*</span>
                    </label>
                    <input
                      {...register("company_name", { required: "Company name is required" })}
                      className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                      placeholder="e.g. Acme Logistics Ltd."
                    />
                    {errors.company_name && (
                      <span className="text-xs text-[var(--theme-status-danger-fg)] mt-1">{errors.company_name.message}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                        Partner Type <span className="text-[var(--theme-status-danger-fg)]">*</span>
                      </label>
                      <Controller
                        name="partner_type"
                        control={control}
                        render={({ field }) => (
                          <CustomDropdown
                            value={field.value}
                            onChange={field.onChange}
                            options={[
                              { value: "international", label: "International Partner" },
                              { value: "co-loader", label: "Co-Loader" },
                              { value: "all-in", label: "All-In Partner" }
                            ]}
                            fullWidth
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                        WCA ID
                      </label>
                      <input
                        {...register("wca_id")}
                        className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_wca"
                      {...register("is_wca_conference")}
                      className="rounded border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
                    />
                    <label htmlFor="is_wca" className="text-sm text-[var(--theme-text-secondary)] cursor-pointer select-none">
                      Is WCA Conference Member?
                    </label>
                  </div>
                </div>
              </div>

              <div className="h-px bg-[var(--theme-bg-surface-tint)]" />

              {/* SECTION 2: Location */}
              <div>
                <div className="flex items-center gap-2 mb-4 text-[var(--theme-action-primary-bg)]">
                  <MapPin size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wide">Location</h3>
                </div>

                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                        Country <span className="text-[var(--theme-status-danger-fg)]">*</span>
                      </label>
                      <Controller
                        name="country"
                        control={control}
                        rules={{ required: "Country is required" }}
                        render={({ field }) => (
                          <CustomDropdown
                            value={field.value}
                            onChange={field.onChange}
                            options={COUNTRIES.map(country => ({ value: country, label: country }))}
                            placeholder="Select Country"
                            fullWidth
                            required
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                        Territory / City
                      </label>
                      <input
                        {...register("territory")}
                        className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                        placeholder="e.g. Shanghai"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                      Full Address
                    </label>
                    <textarea
                      {...register("address")}
                      rows={2}
                      className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent resize-none"
                      placeholder="Street address, building, etc."
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-[var(--theme-bg-surface-tint)]" />

              {/* SECTION 3: Contact Details */}
              <div>
                <div className="flex items-center gap-2 mb-4 text-[var(--theme-action-primary-bg)]">
                  <User size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wide">Contact Details</h3>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                      Primary Contact Person <span className="text-[var(--theme-status-danger-fg)]">*</span>
                    </label>
                    <input
                      {...register("contact_person", { required: "Contact person is required" })}
                      className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                      placeholder="Full Name"
                    />
                    {errors.contact_person && (
                      <span className="text-xs text-[var(--theme-status-danger-fg)] mt-1">{errors.contact_person.message}</span>
                    )}
                  </div>

                  {/* Emails */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                      Emails
                    </label>
                    <div className="space-y-2">
                      {emailFields.map((field, index) => (
                        <div key={field.id} className="flex gap-2">
                          <input
                            {...register(`emails.${index}.value` as const)}
                            className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                            placeholder="email@example.com"
                          />
                          {emailFields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEmail(index)}
                              className="p-2 text-[var(--theme-text-muted)] hover:text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => appendEmail({ value: "" })}
                        className="text-xs font-semibold text-[var(--theme-action-primary-bg)] hover:text-[#0D6660] flex items-center gap-1"
                      >
                        <Plus size={14} /> Add Email
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Phones */}
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                        Phone
                      </label>
                      <div className="space-y-2">
                        {phoneFields.map((field, index) => (
                          <div key={field.id} className="flex gap-2">
                            <input
                              {...register(`phones.${index}.value` as const)}
                              className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                              placeholder="+1 234..."
                            />
                            {phoneFields.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePhone(index)}
                                className="p-2 text-[var(--theme-text-muted)] hover:text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => appendPhone({ value: "" })}
                          className="text-xs font-semibold text-[var(--theme-action-primary-bg)] hover:text-[#0D6660] flex items-center gap-1"
                        >
                          <Plus size={14} /> Add Phone
                        </button>
                      </div>
                    </div>

                    {/* Mobiles */}
                    <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                        Mobile
                      </label>
                      <div className="space-y-2">
                        {mobileFields.map((field, index) => (
                          <div key={field.id} className="flex gap-2">
                            <input
                              {...register(`mobiles.${index}.value` as const)}
                              className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                              placeholder="+1 234..."
                            />
                            {mobileFields.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeMobile(index)}
                                className="p-2 text-[var(--theme-text-muted)] hover:text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => appendMobile({ value: "" })}
                          className="text-xs font-semibold text-[var(--theme-action-primary-bg)] hover:text-[#0D6660] flex items-center gap-1"
                        >
                          <Plus size={14} /> Add Mobile
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                      Website
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Globe size={14} className="text-[var(--theme-text-muted)]" />
                      </div>
                      <input
                        {...register("website")}
                        className="w-full pl-9 pr-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                        placeholder="www.example.com"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-[var(--theme-bg-surface-tint)]" />

              {/* SECTION 4: Status & Services */}
              <div>
                <div className="flex items-center gap-2 mb-4 text-[var(--theme-action-primary-bg)]">
                  <CheckSquare size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wide">Status & Services</h3>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                      Partnership Expiry Date
                    </label>
                    <Controller
                      name="expires"
                      control={control}
                      render={({ field }) => (
                        <CustomDatePicker
                          value={field.value}
                          onChange={field.onChange}
                          minWidth="100%"
                          placeholder="dd/mm/yyyy"
                        />
                      )}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
                      Services Offered
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {SERVICE_OPTIONS.map((service) => (
                        <div 
                          key={service}
                          onClick={() => toggleService(service)}
                          className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all
                            ${selectedServices.includes(service) 
                              ? "bg-[var(--theme-bg-surface-tint)] border-[var(--theme-action-primary-bg)] text-[var(--theme-action-primary-bg)]" 
                              : "bg-[var(--theme-bg-surface)] border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)]"}
                          `}
                        >
                          <div className={`
                            w-4 h-4 rounded border flex items-center justify-center
                            ${selectedServices.includes(service)
                              ? "bg-[var(--theme-action-primary-bg)] border-[var(--theme-action-primary-bg)]"
                              : "border-[var(--theme-border-default)]"}
                          `}>
                            {selectedServices.includes(service) && <div className="w-2 h-2 bg-[var(--theme-bg-surface)] rounded-sm" />}
                          </div>
                          {service}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                      Internal Notes
                    </label>
                    <textarea
                      {...register("notes")}
                      rows={3}
                      className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent resize-none"
                      placeholder="Any specific handling instructions or notes..."
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "24px 32px",
              borderTop: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--theme-bg-page)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 16px",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--theme-text-secondary)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "10px 16px",
                backgroundColor: "var(--theme-action-primary-bg)",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              {initialData ? "Save Changes" : (
                <>
                  <Plus size={16} />
                  Create Partner
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  );
}
