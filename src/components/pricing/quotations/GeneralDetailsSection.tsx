import { motion } from "motion/react";
import { Edit3, FileText, Handshake, Link2, AlertTriangle } from "lucide-react";
import { FormSelect } from "./FormSelect";
import { CompanyAutocomplete } from "../../crm/CompanyAutocomplete";
import { ContactPersonAutocomplete } from "../../crm/ContactPersonAutocomplete";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import type { QuotationType } from "../../../types/pricing";

type ContractDetection = { contractId?: string; contractNumber?: string; [key: string]: any };

// Helper component for read-only field display
function DisplayField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label style={{
        display: "block",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--neuron-ink-secondary)",
        marginBottom: "8px"
      }}>
        {label}
      </label>
      <div style={{
        padding: "10px 12px",
        fontSize: "13px",
        color: "var(--neuron-ink-base)",
        backgroundColor: "var(--theme-bg-surface-subtle)",
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "6px",
        minHeight: "38px",
        display: "flex",
        alignItems: "center"
      }}>
        {value || "—"}
      </div>
    </div>
  );
}

interface GeneralDetailsSectionProps {
  // Customer (Company)
  customerId: string;
  setCustomerId: (value: string) => void;
  customerName: string;
  setCustomerName: (value: string) => void;
  
  // Contact Person
  contactPersonId: string;
  setContactPersonId: (value: string) => void;
  contactPersonName: string;
  setContactPersonName: (value: string) => void;
  
  // Quotation Name
  quotationName: string;
  setQuotationName: (value: string) => void;
  
  // Services (multi-select)
  selectedServices: string[];
  setSelectedServices: (services: string[]) => void;
  
  // Dates
  date: string;
  setDate: (value: string) => void;
  
  // Terms
  creditTerms: string;
  setCreditTerms: (value: string) => void;
  validity: string;
  setValidity: (value: string) => void;
  
  // Movement
  movement: "IMPORT" | "EXPORT";
  setMovement: (value: "IMPORT" | "EXPORT") => void;

  // View mode
  viewMode?: boolean; // When true, renders in read-only display mode
  onAmend?: () => void; // Optional amend handler for view mode

  // ✨ CONTRACT: Quotation type toggle and contract validity
  quotationType?: QuotationType;
  setQuotationType?: (value: QuotationType) => void;
  contractValidityStart?: string;
  setContractValidityStart?: (value: string) => void;
  contractValidityEnd?: string;
  setContractValidityEnd?: (value: string) => void;
  showValidityEndError?: boolean;
  isEditMode?: boolean; // When true, lock quotation type toggle

  // ✨ CONTRACT REFERENCE: Inline contract detection display
  contractDetection?: ContractDetection;
}

const AVAILABLE_SERVICES = [
  "Brokerage",
  "Forwarding",
  "Trucking",
  "Marine Insurance",
  "Others"
];

// ✨ CONTRACT: Only these services are eligible for contracts
const CONTRACT_SERVICES = [
  "Brokerage",
  "Trucking",
  "Others"
];

export function GeneralDetailsSection({
  customerId,
  setCustomerId,
  customerName,
  setCustomerName,
  contactPersonId,
  setContactPersonId,
  contactPersonName,
  setContactPersonName,
  quotationName,
  setQuotationName,
  selectedServices,
  setSelectedServices,
  date,
  setDate,
  creditTerms,
  setCreditTerms,
  validity,
  setValidity,
  movement,
  setMovement,
  viewMode = false,
  onAmend,
  quotationType = "project",
  setQuotationType,
  contractValidityStart = "",
  setContractValidityStart,
  contractValidityEnd = "",
  setContractValidityEnd,
  showValidityEndError = false,
  isEditMode = false,
  contractDetection,
}: GeneralDetailsSectionProps) {
  const handleServiceToggle = (service: string) => {
    if (selectedServices.includes(service)) {
      setSelectedServices(selectedServices.filter(s => s !== service));
    } else {
      setSelectedServices([...selectedServices, service]);
    }
  };

  // Format date for display in view mode
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric"
    });
  };

  return (
    <div style={{
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--neuron-brand-green)",
          margin: 0
        }}>
          {quotationType === "contract" ? "Contract Details" : "General Details"}
        </h2>

        {viewMode && onAmend && (
            <button
              onClick={onAmend}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--theme-action-primary-bg)",
                backgroundColor: "transparent",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; // Very light hover only
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Edit3 size={14} /> 
              </div>
              Amend
            </button>
        )}
      </div>

      <div style={{ display: "grid", gap: "20px" }}>
        {/* Movement Selection - High Level Switch (shown for all quotation types) */}
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: viewMode ? "var(--neuron-ink-secondary)" : "var(--neuron-ink-base)",
            marginBottom: "8px"
          }}>
            Movement
          </label>
          {viewMode ? (
            <DisplayField label="" value={movement} />
          ) : (
            <div style={{ 
              display: "inline-flex",
              border: "1px solid var(--neuron-ui-border)", 
              borderRadius: "10px",
              padding: "4px",
              backgroundColor: "var(--theme-bg-surface)",
              width: "fit-content"
            }}>
              {(["IMPORT", "EXPORT"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMovement(option)}
                  style={{
                    position: "relative",
                    padding: "6px 16px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: movement === option ? "var(--theme-action-primary-text)" : "var(--neuron-ink-secondary)",
                    backgroundColor: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "color 0.2s ease",
                    zIndex: 1,
                    outline: "none"
                  }}
                >
                  {movement === option && (
                    <motion.div
                      layoutId="movement-pill"
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "var(--theme-action-primary-bg)",
                        borderRadius: "6px",
                        zIndex: -1
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <span style={{ position: "relative", zIndex: 2 }}>
                    {option === "IMPORT" ? "Import" : "Export"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Customer Selection */}
        {viewMode ? (
          <DisplayField label="Customer" value={customerName} />
        ) : (
          <div>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--neuron-ink-base)",
              marginBottom: "8px"
            }}>
              Select Customer *
            </label>
            <CompanyAutocomplete
              value={customerName}
              companyId={customerId}
              onChange={(name, id) => {
                setCustomerName(name);
                setCustomerId(id);
                // Clear contact person when customer changes
                setContactPersonName("");
                setContactPersonId("");
              }}
              placeholder="Select or search customer..."
            />
          </div>
        )}

        {/* Contact Person Selection */}
        {viewMode ? (
          <DisplayField label="Contact Person" value={contactPersonName} />
        ) : (
          <div>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--neuron-ink-base)",
              marginBottom: "8px"
            }}>
              Select Contact Person *
            </label>
            <ContactPersonAutocomplete
              value={contactPersonName}
              contactId={contactPersonId}
              customerId={customerId} // ✅ Pass customerId instead of companyName
              disabled={!customerId} // ✅ Disable until customer is selected
              onChange={(name, id) => {
                setContactPersonName(name);
                setContactPersonId(id);
              }}
              placeholder="Select or search contact person..."
            />
          </div>
        )}

        {/* Quotation Name */}
        {viewMode ? (
          <DisplayField label={quotationType === "contract" ? "Contract Name" : "Quotation Name"} value={quotationName} />
        ) : (
          <div>
            <label htmlFor="general-quotation-name" style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--neuron-ink-base)",
              marginBottom: "8px"
            }}>
              {quotationType === "contract" ? "Contract Name *" : "Quotation Name *"}
            </label>
            <input
              id="general-quotation-name"
              type="text"
              value={quotationName}
              onChange={(e) => setQuotationName(e.target.value)}
              placeholder={quotationType === "contract" ? "Enter contract name..." : "Enter quotation name..."}
              autoComplete="off"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "13px",
                color: "var(--neuron-ink-base)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                outline: "none",
                transition: "border-color 0.15s ease"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              }}
            />
          </div>
        )}

        {/* Services Selection (Multi-select with chips) */}
        <div>
          <label htmlFor="general-services" style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: viewMode ? "var(--neuron-ink-secondary)" : "var(--neuron-ink-base)",
            marginBottom: "8px"
          }}>
            {viewMode ? "Services" : "Select Service/s *"}
          </label>
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px"
          }}>
            {viewMode ? (
              // View mode: show only selected services as badges
              selectedServices.length > 0 ? (
                selectedServices.map(service => (
                  <div
                    key={service}
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--theme-action-primary-text)",
                      backgroundColor: "var(--theme-action-primary-bg)",
                      border: "1px solid var(--theme-action-primary-bg)",
                      borderRadius: "6px"
                    }}
                  >
                    {service}
                  </div>
                ))
              ) : (
                <span style={{ fontSize: "13px", color: "var(--neuron-ink-muted)" }}>—</span>
              )
            ) : (
              // Edit mode: show all services as toggleable buttons
              (quotationType === "contract" ? CONTRACT_SERVICES : AVAILABLE_SERVICES).map(service => {
                const isSelected = selectedServices.includes(service);
                return (
                  <button
                    key={service}
                    type="button"
                    onClick={() => handleServiceToggle(service)}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: isSelected ? "var(--theme-action-primary-text)" : "var(--neuron-ink-base)",
                      backgroundColor: isSelected ? "var(--theme-action-primary-bg)" : "var(--theme-bg-surface)",
                      border: `1px solid ${isSelected ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-border)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {service}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Date, Credit Terms, Validity in a grid */}
        {quotationType === "contract" ? (
          /* ✨ CONTRACT: Date Created, Valid Until (Credit Terms removed — not applicable for contracts) */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {viewMode ? (
              <>
                <DisplayField label="Date Created" value={formatDate(date)} />
                <DisplayField label="Valid Until" value={formatDate(contractValidityEnd)} />
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="general-contract-date" style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-base)", marginBottom: "8px" }}>
                    Date Created *
                  </label>
                  <input id="general-contract-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", fontSize: "13px", color: "var(--neuron-ink-base)", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", outline: "none" }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-teal)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: showValidityEndError ? "var(--theme-status-danger-fg)" : "var(--neuron-ink-base)", marginBottom: "8px" }}>
                    Valid Until *
                  </label>
                  <CustomDatePicker
                    value={contractValidityEnd || ""}
                    onChange={(val) => setContractValidityEnd?.(val)}
                    placeholder="dd/mm/yyyy"
                    minWidth="100%"
                  />
                  {showValidityEndError && (
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--theme-status-danger-fg)" }}>
                      Valid Until date is required before saving.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          {viewMode ? (
            <>
              <DisplayField label="Date" value={formatDate(date)} />
              <DisplayField label="Credit Terms" value={creditTerms} />
              <DisplayField label="Validity" value={validity ? `${validity} days` : ""} />
            </>
          ) : (
            <>
              <div>
                <label htmlFor="general-date" style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Date *
                </label>
                <input
                  id="general-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)",
                    backgroundColor: "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    outline: "none",
                    transition: "border-color 0.15s ease"
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  }}
                />
              </div>

              <div>
                <label htmlFor="general-credit-terms" style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Credit Terms
                </label>
                <CustomDropdown
                  value={creditTerms}
                  onChange={setCreditTerms}
                  placeholder="Select terms..."
                  fullWidth
                  options={[
                    { value: "COD", label: "COD (Cash on Delivery)" },
                    { value: "Net 7", label: "Net 7" },
                    { value: "Net 15", label: "Net 15" },
                    { value: "Net 30", label: "Net 30" },
                    { value: "Net 45", label: "Net 45" },
                    { value: "Net 60", label: "Net 60" },
                    { value: "Net 90", label: "Net 90" },
                  ]}
                  buttonStyle={{ padding: "10px 12px", fontSize: "13px", borderRadius: "6px" }}
                />
              </div>

              <div>
                <label htmlFor="general-validity" style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Validity
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    id="general-validity"
                    type="number"
                    min="1"
                    value={validity}
                    onChange={(e) => setValidity(e.target.value)}
                    placeholder="e.g., 30"
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      transition: "border-color 0.15s ease"
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                  <span style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", whiteSpace: "nowrap" }}>days</span>
                </div>
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* ✨ CONTRACT REFERENCE: Inline contract detection display (project quotations only) */}
      {contractDetection && quotationType !== "contract" && (
        <div style={{ marginTop: "20px" }}>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-secondary)",
            marginBottom: "8px"
          }}>
            Linked Contract
          </label>

          {contractDetection.loading ? (
            /* Loading state — inline spinner */
            <div style={{
              padding: "10px 12px",
              fontSize: "13px",
              color: "var(--theme-text-muted)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "6px",
              minHeight: "38px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <div style={{
                width: "14px", height: "14px",
                border: "2px solid var(--theme-border-default)", borderTopColor: "var(--theme-action-primary-bg)",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }} />
              <span>Looking up contracts for this customer...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : contractDetection.contract ? (
            /* Contract found — teal-accented field */
            <div style={{
              padding: "10px 12px",
              fontSize: "13px",
              backgroundColor: "var(--theme-bg-surface-tint)",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "6px",
              minHeight: "38px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <Link2 size={14} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: "var(--theme-action-primary-bg)" }}>
                {contractDetection.contract.quote_number}
              </span>
              {contractDetection.contract.quotation_name && (
                <span style={{ color: "var(--theme-text-primary)" }}>
                  — {contractDetection.contract.quotation_name}
                </span>
              )}
              {(contractDetection.contract.contract_validity_start || contractDetection.contract.contract_validity_end) && (
                <span style={{
                  marginLeft: "auto",
                  fontSize: "11px",
                  color: "var(--theme-text-muted)",
                  flexShrink: 0,
                }}>
                  {(() => {
                    const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
                    const start = contractDetection.contract.contract_validity_start;
                    const end = contractDetection.contract.contract_validity_end;
                    if (start && end) return `${fmt(start)} – ${fmt(end)}`;
                    if (end) return `Until ${fmt(end)}`;
                    return `From ${fmt(start!)}`;
                  })()}
                </span>
              )}
            </div>
          ) : contractDetection.noContractFound ? (
            /* No contract found — amber subtle */
            <div style={{
              padding: "10px 12px",
              fontSize: "13px",
              color: "var(--theme-status-warning-fg)",
              backgroundColor: "var(--theme-status-warning-bg)",
              border: "1px solid var(--theme-status-warning-border)",
              borderRadius: "6px",
              minHeight: "38px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <AlertTriangle size={14} style={{ color: "var(--theme-status-warning-fg)", flexShrink: 0 }} />
              <span>No active contract found. Rates will be entered manually.</span>
            </div>
          ) : (
            /* Idle — no customer entered yet */
            <div style={{
              padding: "10px 12px",
              fontSize: "13px",
              color: "var(--neuron-ink-muted)",
              backgroundColor: "var(--theme-bg-surface-subtle)",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "6px",
              minHeight: "38px",
              display: "flex",
              alignItems: "center",
            }}>
              —
            </div>
          )}
        </div>
      )}
    </div>
  );
}