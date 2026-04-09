import { getServiceIcon, getQuotationStatusColor, getQuotationStatusBgColor, formatShortDate } from "../../utils/quotation-helpers";
import { Search, Briefcase, Ship, Shield, Truck, SlidersHorizontal, Calendar, CircleDot, Building2, FileText } from "lucide-react";
import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import type { QuotationNew, QuotationType } from "../../types/pricing";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { CreateQuotationMenu } from "./CreateQuotationMenu";
import { QuotationTypeIcon, QuotationTypeSubLabel, getQuotationTypeAccentStyle } from "./QuotationTypeIcons";
import {
  getNormalizedQuotationStatus,
  QUOTATION_COMPLETED_STATUSES,
  QUOTATION_INQUIRY_STATUSES,
  QUOTATION_NEGOTIATION_STATUSES,
} from "../../utils/quotationStatus";

// Default column widths
const DEFAULT_COLUMN_WIDTHS = {
  icon: 40,
  name: 220,
  customer: 220,
  services: 120,
  total: 100,
  date: 95,
  status: 115,
  assignee: 130
};

// Minimum column widths to prevent collapse
const MIN_COLUMN_WIDTHS = {
  icon: 40,
  name: 150,
  customer: 140,
  services: 90,
  total: 80,
  date: 80,
  status: 90,
  assignee: 90
};

interface QuotationsListWithFiltersProps {
  onViewItem: (item: QuotationNew) => void;
  onCreateQuotation: (quotationType: QuotationType) => void;
  quotations?: QuotationNew[];
  isLoading?: boolean;
  userDepartment?: "Business Development" | "Pricing";
  onRefresh?: () => void;
  currentUserId?: string;
  userRole?: string;
}

interface QuotationTableRowProps {
  item: QuotationNew;
  index: number;
  totalItems: number;
  onItemClick: (item: QuotationNew) => void;
  gridTemplateColumns: string;
  showStatus?: boolean;
  showAssignee?: boolean;
  assigneeName?: string;
}

function QuotationTableRow({ item, index, totalItems, onItemClick, gridTemplateColumns, showStatus, showAssignee, assigneeName }: QuotationTableRowProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showNameTooltip, setShowNameTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const iconRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const hasMultipleServices = item.services.length > 1;

  // ✨ CONTRACT: Detect contract quotations
  const isContract = item.quotation_type === "contract";
  const normalizedStatus = getNormalizedQuotationStatus(item);

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8
      });
      setShowTooltip(true);
    }
  };

  const handleNameMouseEnter = () => {
    if (nameRef.current) {
      const rect = nameRef.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8
      });
      setShowNameTooltip(true);
    }
  };

  // Calculate total (sum of all line items)
  const total = item.charge_categories?.reduce((sum, category) => {
    const categoryTotal = category.line_items?.reduce((lineSum, lineItem) => {
      return lineSum + (lineItem.amount || 0);
    }, 0) || 0;
    return sum + categoryTotal;
  }, 0) || 0;

  return (
    <div
      className="grid transition-colors cursor-pointer"
      style={{ 
        gridTemplateColumns: gridTemplateColumns,
        gap: "12px",
        padding: "10px 16px",
        borderBottom: "none",
        backgroundColor: index % 2 === 0 ? "var(--theme-bg-surface)" : "var(--theme-bg-surface-subtle)",
        position: "relative",
        ...getQuotationTypeAccentStyle(item.quotation_type),
      }}
      onClick={() => onItemClick(item)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = index % 2 === 0 ? "var(--theme-bg-surface)" : "var(--theme-bg-surface-subtle)";
      }}
    >
      {/* Icon — type-aware (Project vs Contract) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <QuotationTypeIcon type={item.quotation_type} size={16} />
      </div>

      {/* Quotation Name with type sub-label */}
      <div 
        ref={nameRef}
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}
        onMouseEnter={handleNameMouseEnter}
        onMouseLeave={() => setShowNameTooltip(false)}
      >
        <span style={{
          fontSize: "13px",
          color: "var(--theme-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 500
        }}>
          {item.quotation_name || "Untitled"}
        </span>
        <QuotationTypeSubLabel quoteNumber={item.quote_number} type={item.quotation_type} />
      </div>

      {/* Tooltip for Quote Name */}
      {showNameTooltip && (
        <div
          style={{
            position: "fixed",
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: "translate(-50%, -100%)",
            backgroundColor: "var(--theme-text-primary)",
            color: "var(--theme-bg-surface)",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
          }}
        >
          {item.quotation_name || "Untitled"}
        </div>
      )}

      {/* Customer */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
          {item.customer_name || "—"}
        </span>
      </div>

      {/* Service Types */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        {item.services.map((service, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center" }}>
            {getServiceIcon(service)}
          </div>
        ))}
      </div>

      {/* Total / Validity Period */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {isContract ? (
          <span style={{
            fontSize: "12px",
            color: "var(--theme-text-muted)",
          }}>
            {item.contract_validity_start && item.contract_validity_end
              ? `${formatShortDate(item.contract_validity_start)} - ${formatShortDate(item.contract_validity_end)}`
              : "No validity set"
            }
          </span>
        ) : (
          <span style={{
            fontSize: "13px",
            color: total > 0 ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
          }}>
            {item.currency} {total > 0 ? total.toLocaleString() : "0"}
          </span>
        )}
      </div>

      {/* Date */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
          {formatShortDate(item.created_date)}
        </span>
      </div>

      {/* Status (uses contract_status for contracts) */}
      {showStatus && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              fontSize: "13px",
              color: getQuotationStatusColor(normalizedStatus),
              backgroundColor: getQuotationStatusBgColor(normalizedStatus),
              padding: "4px 8px",
              borderRadius: "4px",
              fontWeight: 500
            }}
          >
            {normalizedStatus}
          </span>
        </div>
      )}

      {/* Assignee */}
      {showAssignee && (
        <div style={{ display: "flex", alignItems: "center" }}>
          {assigneeName ? (
            <span style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--neuron-brand-green)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {assigneeName}
            </span>
          ) : (
            <span style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--theme-status-warning-fg)",
              backgroundColor: "var(--theme-status-warning-bg)",
              padding: "2px 8px",
              borderRadius: "4px",
            }}>
              Unassigned
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function QuotationsListWithFilters({ onViewItem, onCreateQuotation, quotations, isLoading, userDepartment, onRefresh, currentUserId, userRole }: QuotationsListWithFiltersProps) {
  // Fetch Pricing user names to display assignee chips in the Inquiries tab
  const { data: pricingUserMap = {} } = useQuery({
    queryKey: ["users", "pricing-name-map"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, name").eq("department", "Pricing");
      return Object.fromEntries((data || []).map((u: { id: string; name: string }) => [u.id, u.name])) as Record<string, string>;
    },
    enabled: userDepartment === "Pricing",
    staleTime: 5 * 60 * 1000,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [serviceFilter, setServiceFilter] = useState("All Services");
  const [customerFilter, setCustomerFilter] = useState("All Customers");
  const [workflowTab, setWorkflowTab] = useState<"Inquiries" | "Quotations" | "Completed">("Inquiries");
  
  // ✨ CONTRACT: Quotation type filter
  const [typeFilter, setTypeFilter] = useState<"All" | "Project" | "Contract">("All");
  
  // Column width state
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Load saved column widths from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('quotations-column-widths');
    if (saved) {
      try {
        setColumnWidths(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved column widths');
      }
    }
  }, []);

  // Save column widths to localStorage
  const saveColumnWidths = (widths: typeof DEFAULT_COLUMN_WIDTHS) => {
    localStorage.setItem('quotations-column-widths', JSON.stringify(widths));
  };

  // Start resize
  const handleResizeStart = (column: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizingColumn(column);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[column as keyof typeof columnWidths];
  };

  // Handle resize
  useEffect(() => {
    if (!isResizing || !resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX.current;
      const newWidth = Math.max(
        MIN_COLUMN_WIDTHS[resizingColumn as keyof typeof MIN_COLUMN_WIDTHS],
        resizeStartWidth.current + diff
      );
      
      setColumnWidths(prev => {
        const updated = { ...prev, [resizingColumn]: newWidth };
        return updated;
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingColumn(null);
      saveColumnWidths(columnWidths);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingColumn, columnWidths]);

  // Build grid template columns string
  const showStatus = userDepartment === "Business Development";
  const showAssigneeCol = userDepartment === "Pricing" && workflowTab === "Inquiries";
  const gridTemplateColumns = showStatus
    ? `${columnWidths.icon}px ${columnWidths.name}px ${columnWidths.customer}px ${columnWidths.services}px ${columnWidths.total}px ${columnWidths.date}px ${columnWidths.status}px`
    : showAssigneeCol
      ? `${columnWidths.icon}px ${columnWidths.name}px ${columnWidths.customer}px ${columnWidths.services}px ${columnWidths.total}px ${columnWidths.date}px ${columnWidths.assignee}px`
      : `${columnWidths.icon}px ${columnWidths.name}px ${columnWidths.customer}px ${columnWidths.services}px ${columnWidths.total}px ${columnWidths.date}px`;

  // Get unique customers and services for filters
  const uniqueCustomers = useMemo(() => {
    const customers = new Set((quotations || []).map(q => q.customer_name).filter(Boolean));
    return ["All Customers", ...Array.from(customers)];
  }, [quotations]);

  const uniqueServices = useMemo(() => {
    const services = new Set((quotations || []).flatMap(q => q.services));
    return ["All Services", ...Array.from(services)];
  }, [quotations]);

  // Filter quotations
  const filteredQuotations = useMemo(() => {
    let filtered = quotations || [];

    // ✨ CONTRACT: Type filter (All / Project / Contract)
    if (typeFilter === "Contract") {
      filtered = filtered.filter(item => item.quotation_type === "contract");
    } else if (typeFilter === "Project") {
      filtered = filtered.filter(item => !item.quotation_type || item.quotation_type === "project");
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.quote_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.services.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Status filter
    if (statusFilter !== "All Statuses") {
      filtered = filtered.filter(item => getNormalizedQuotationStatus(item) === statusFilter);
    }

    // Service filter
    if (serviceFilter !== "All Services") {
      filtered = filtered.filter(item => item.services.includes(serviceFilter));
    }

    // Customer filter
    if (customerFilter !== "All Customers") {
      filtered = filtered.filter(item => item.customer_name === customerFilter);
    }

    // Date range filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter(item => new Date(item.created_date) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(item => new Date(item.created_date) <= toDate);
    }

    // Workflow tab filter
    if (workflowTab === "Inquiries") {
      // Unpriced quotations (Draft + Pending Pricing + Needs Revision)
      filtered = filtered.filter(item =>
        QUOTATION_INQUIRY_STATUSES.includes(getNormalizedQuotationStatus(item))
      );
      // Pricing staff see only their assigned inquiries
      if (userRole === "staff" && currentUserId) {
        filtered = filtered.filter(item => (item as any).assigned_to === currentUserId);
      }
    } else if (workflowTab === "Quotations") {
      // Priced quotations being negotiated
      filtered = filtered.filter(item =>
        QUOTATION_NEGOTIATION_STATUSES.includes(getNormalizedQuotationStatus(item))
      );
    } else if (workflowTab === "Completed") {
      // Accepted or disapproved
      filtered = filtered.filter(item =>
        QUOTATION_COMPLETED_STATUSES.includes(getNormalizedQuotationStatus(item))
      );
    }

    return filtered;
  }, [quotations, searchQuery, dateFrom, dateTo, statusFilter, serviceFilter, customerFilter, workflowTab, typeFilter, userRole, currentUserId]);

  // Calculate tab counts (Inquiries respects staff scoping)
  const tabCounts = useMemo(() => {
    const all = quotations || [];
    const inquiryItems = all.filter(q => QUOTATION_INQUIRY_STATUSES.includes(getNormalizedQuotationStatus(q)));
    const inquiryCount = (userRole === "staff" && currentUserId)
      ? inquiryItems.filter(q => (q as any).assigned_to === currentUserId).length
      : inquiryItems.length;
    return {
      Inquiries: inquiryCount,
      Quotations: all.filter(q => QUOTATION_NEGOTIATION_STATUSES.includes(getNormalizedQuotationStatus(q))).length,
      Completed: all.filter(q => QUOTATION_COMPLETED_STATUSES.includes(getNormalizedQuotationStatus(q))).length
    };
  }, [quotations, userRole, currentUserId]);

  // Conditional text based on department
  const headerTitle = showStatus ? "Inquiries" : "Quotations";
  const headerSubtitle = showStatus 
    ? "Create and manage customer inquiries" 
    : "Manage quotations from BD";
  const buttonText = showStatus ? "Create Inquiry" : "Create Quotation";
  const searchPlaceholder = showStatus ? "Search inquiries..." : "Search quotations...";

  // ✨ Add entity word for project/contract
  const entityWord = showStatus ? "Inquiry" : "Quotation";

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      height: "100%",
      backgroundColor: "var(--theme-bg-surface)"
    }}>
      {/* Header Section */}
      <div style={{ 
        padding: "32px 48px 24px 48px",
        borderBottom: "1px solid var(--neuron-ui-border)"
      }}>
        {/* Title and Create Button */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "flex-start",
          marginBottom: "24px"
        }}>
          <div>
            <h1 style={{ 
              fontSize: "32px",
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              marginBottom: "4px",
              letterSpacing: "-1.2px"
            }}>
              {headerTitle}
            </h1>
            <p style={{ 
              fontSize: "14px",
              color: "var(--theme-text-muted)",
              margin: 0
            }}>
              {headerSubtitle}
            </p>
          </div>
          
          <CreateQuotationMenu
            onSelect={onCreateQuotation}
            buttonText={buttonText}
            entityWord={entityWord}
          />
        </div>

        {/* Search Bar - Full Width */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--theme-text-muted)",
            }}
          />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 40px",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
              color: "var(--theme-text-primary)",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          />
        </div>

        {/* Filters Row - All Filters on One Line */}
        <div style={{ 
          display: "flex",
          gap: "4px",
          alignItems: "center",
          marginBottom: "20px"
        }}>
          {/* Date Filter */}
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2" />
          </div>
          <span className="text-[13px] text-[var(--theme-text-muted)] font-medium px-2">to</span>
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2" />
          </div>

          {/* ✨ CONTRACT: Type Filter (dropdown, matching other filters) */}
          <div style={{ minWidth: "130px" }}>
            <CustomDropdown
              value={typeFilter === "All" ? "All Types" : typeFilter}
              onChange={(val) => {
                if (val === "All Types") setTypeFilter("All");
                else setTypeFilter(val as "Project" | "Contract");
              }}
              options={[
                { value: "All Types", label: "All Types", icon: <FileText size={16} /> },
                { value: "Project", label: "Project", icon: <FileText size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> },
                { value: "Contract", label: "Contract", icon: <FileText size={16} style={{ color: "var(--theme-text-primary)" }} /> },
              ]}
              placeholder="Select type"
            />
          </div>

          {/* Status Filter */}
          <div style={{ minWidth: "140px" }}>
            <CustomDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "All Statuses", label: "All Statuses", icon: <CircleDot size={16} /> },
                { value: "Draft", label: "Draft", icon: <CircleDot size={16} style={{ color: "var(--theme-text-muted)" }} /> },
                { value: "Pending Pricing", label: "Pending Pricing", icon: <CircleDot size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                { value: "Priced", label: "Priced", icon: <CircleDot size={16} style={{ color: "var(--neuron-status-accent-fg)" }} /> },
                { value: "Sent to Client", label: "Sent to Client", icon: <CircleDot size={16} style={{ color: "var(--neuron-semantic-info)" }} /> },
                { value: "Needs Revision", label: "Needs Revision", icon: <CircleDot size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                { value: "Accepted by Client", label: "Accepted by Client", icon: <CircleDot size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                { value: "Rejected by Client", label: "Rejected by Client", icon: <CircleDot size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> },
                { value: "Disapproved", label: "Disapproved", icon: <CircleDot size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> },
                { value: "Converted to Project", label: "Converted to Project", icon: <CircleDot size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                { value: "Converted to Contract", label: "Converted to Contract", icon: <CircleDot size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                { value: "Cancelled", label: "Cancelled", icon: <CircleDot size={16} style={{ color: "var(--theme-text-muted)" }} /> }
              ]}
              placeholder="Select status"
            />
          </div>

          {/* Service Filter */}
          <div style={{ minWidth: "140px" }}>
            <CustomDropdown
              value={serviceFilter}
              onChange={setServiceFilter}
              options={uniqueServices.map(service => {
                if (service === "All Services") return { value: service, label: service, icon: <Briefcase size={16} /> };
                if (service === "Brokerage") return { value: service, label: service, icon: <Briefcase size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> };
                if (service === "Forwarding") return { value: service, label: service, icon: <Ship size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> };
                if (service === "Marine Insurance") return { value: service, label: service, icon: <Shield size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> };
                if (service === "Trucking") return { value: service, label: service, icon: <Truck size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> };
                return { value: service, label: service, icon: <FileText size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> };
              })}
              placeholder="Select service"
            />
          </div>

          {/* Customer Filter */}
          <div style={{ minWidth: "150px" }}>
            <CustomDropdown
              value={customerFilter}
              onChange={setCustomerFilter}
              options={uniqueCustomers.map(customer => ({
                value: customer,
                label: customer,
                icon: customer === "All Customers" ? <Building2 size={16} /> : <Building2 size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
              }))}
              placeholder="Select customer"
            />
          </div>
        </div>

        {/* Workflow Tabs */}
        <div style={{ 
          display: "flex", 
          gap: "24px"
        }}>
          {(["Inquiries", "Quotations", "Completed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setWorkflowTab(tab)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 4px",
                background: "none",
                border: "none",
                borderBottom: workflowTab === tab ? "2px solid var(--neuron-brand-green)" : "2px solid transparent",
                fontSize: "14px",
                fontWeight: 600,
                color: workflowTab === tab ? "var(--neuron-brand-green)" : "var(--neuron-ink-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                marginBottom: "0"
              }}
              onMouseEnter={(e) => {
                if (workflowTab !== tab) {
                  e.currentTarget.style.color = "var(--neuron-ink-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (workflowTab !== tab) {
                  e.currentTarget.style.color = "var(--neuron-ink-secondary)";
                }
              }}
            >
              {tab === "Inquiries" && <SlidersHorizontal size={16} />}
              {tab === "Quotations" && <FileText size={16} />}
              {tab === "Completed" && <FileText size={16} />}
              {tab}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  backgroundColor: workflowTab === tab ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: workflowTab === tab ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)"
                }}
              >
                {tabCounts[tab]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table Section */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 48px" }}>
        {isLoading ? (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            padding: "60px 20px",
            color: "var(--neuron-ink-muted)"
          }}>
            Loading quotations...
          </div>
        ) : filteredQuotations.length === 0 ? (
          <div style={{ 
            display: "flex", 
            flexDirection: "column",
            alignItems: "center", 
            justifyContent: "center",
            padding: "60px 20px",
            color: "var(--neuron-ink-muted)"
          }}>
            <FileText size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
            <p style={{ fontSize: "16px", fontWeight: 500 }}>No quotations found</p>
            <p style={{ fontSize: "14px", marginTop: "8px" }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div style={{ 
            border: "1px solid var(--theme-border-default)",
            borderRadius: "12px",
            overflow: "hidden",
            backgroundColor: "var(--theme-bg-surface)"
          }}>
            {/* Table Header */}
            <div 
              style={{ 
                position: "relative",
                display: "grid",
                gridTemplateColumns: gridTemplateColumns,
                gap: "12px",
                padding: "0 16px",
                backgroundColor: "transparent",
                borderBottom: "1px solid var(--theme-border-default)",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}
            >
              <div style={{ padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Icon column - no label */}
              </div>
              <div style={{ padding: "10px 0", display: "flex", alignItems: "center", position: "relative" }}>
                NAME
                <div
                  onMouseDown={(e) => handleResizeStart('name', e)}
                  style={{
                    position: "absolute",
                    right: "-6px",
                    top: 0,
                    bottom: 0,
                    width: "12px",
                    cursor: "col-resize",
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(15, 118, 110, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{
                    width: "2px",
                    height: "60%",
                    backgroundColor: resizingColumn === 'name' ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"
                  }} />
                </div>
              </div>
              <div style={{ padding: "10px 0", display: "flex", alignItems: "center", position: "relative" }}>
                CUSTOMER
                <div
                  onMouseDown={(e) => handleResizeStart('customer', e)}
                  style={{
                    position: "absolute",
                    right: "-6px",
                    top: 0,
                    bottom: 0,
                    width: "12px",
                    cursor: "col-resize",
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(15, 118, 110, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{
                    width: "2px",
                    height: "60%",
                    backgroundColor: resizingColumn === 'customer' ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"
                  }} />
                </div>
              </div>
              <div style={{ padding: "10px 0", display: "flex", alignItems: "center", position: "relative" }}>
                SERVICE TYPES
                <div
                  onMouseDown={(e) => handleResizeStart('services', e)}
                  style={{
                    position: "absolute",
                    right: "-6px",
                    top: 0,
                    bottom: 0,
                    width: "12px",
                    cursor: "col-resize",
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(15, 118, 110, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{
                    width: "2px",
                    height: "60%",
                    backgroundColor: resizingColumn === 'services' ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"
                  }} />
                </div>
              </div>
              <div style={{ padding: "10px 0", display: "flex", alignItems: "center", position: "relative" }}>
                TOTAL
                <div
                  onMouseDown={(e) => handleResizeStart('total', e)}
                  style={{
                    position: "absolute",
                    right: "-6px",
                    top: 0,
                    bottom: 0,
                    width: "12px",
                    cursor: "col-resize",
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(15, 118, 110, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{
                    width: "2px",
                    height: "60%",
                    backgroundColor: resizingColumn === 'total' ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"
                  }} />
                </div>
              </div>
              <div style={{ padding: "10px 0", display: "flex", alignItems: "center" }}>
                DATE
              </div>
              {showStatus && (
                <div style={{ padding: "10px 0", display: "flex", alignItems: "center" }}>
                  STATUS
                </div>
              )}
              {showAssigneeCol && (
                <div style={{ padding: "10px 0", display: "flex", alignItems: "center" }}>
                  ASSIGNEE
                </div>
              )}
            </div>

            {/* Table Rows */}
            {filteredQuotations.map((item, index) => (
              <QuotationTableRow
                key={item.id}
                item={item}
                index={index}
                totalItems={filteredQuotations.length}
                onItemClick={onViewItem}
                gridTemplateColumns={gridTemplateColumns}
                showStatus={showStatus}
                showAssignee={showAssigneeCol}
                assigneeName={pricingUserMap[(item as any).assigned_to] || ""}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
