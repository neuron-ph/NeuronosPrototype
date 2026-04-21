import { useState } from "react";
import type { QuotationNew, QuotationType } from "../../types/pricing";
import { Package, Search, FileText, CheckCircle2, Calendar, Clock } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { CreateQuotationMenu } from "../pricing/CreateQuotationMenu";

interface CustomerInquiriesTabProps {
  inquiries: QuotationNew[];
  onViewInquiry?: (inquiryId: string) => void;
  onCreateInquiry?: (quotationType: QuotationType) => void;
  isLoading?: boolean;
}

export function CustomerInquiriesTab({ inquiries, onViewInquiry, onCreateInquiry, isLoading }: CustomerInquiriesTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric'
    });
  };

  const getStatusStyle = (status: string) => {
    const statusStyles: Record<string, { bg: string; text: string }> = {
      'Draft': { bg: 'var(--neuron-pill-inactive-bg)', text: 'var(--theme-text-muted)' },
      'Pending Pricing': { bg: 'var(--theme-status-warning-bg)', text: 'var(--theme-status-warning-fg)' },
      'Quoted': { bg: 'var(--neuron-semantic-info-bg)', text: 'var(--neuron-semantic-info)' },
      'Sent': { bg: 'var(--neuron-semantic-info-bg)', text: 'var(--neuron-semantic-info)' },
      'pending': { bg: 'var(--theme-status-warning-bg)', text: 'var(--theme-status-warning-fg)' },
      'draft': { bg: 'var(--neuron-pill-inactive-bg)', text: 'var(--theme-text-muted)' }
    };
    return statusStyles[status] || { bg: 'var(--neuron-pill-inactive-bg)', text: 'var(--theme-text-muted)' };
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>Loading inquiries...</p>
      </div>
    );
  }

  // Filter inquiries
  const filteredInquiries = inquiries.filter(inquiry => {
    // Search filter
    const matchesSearch = searchQuery === "" || 
      (inquiry.quote_number && inquiry.quote_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inquiry.quotation_name && inquiry.quotation_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inquiry.pol_aol && inquiry.pol_aol.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inquiry.pod_aod && inquiry.pod_aod.toLowerCase().includes(searchQuery.toLowerCase()));

    // Status filter
    const matchesStatus = statusFilter === "all" || inquiry.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
            <input 
              type="text"
              placeholder="Search inquiries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] text-[13px] w-[240px] transition-colors"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--neuron-ink-primary)"
              }}
            />
          </div>

          {/* Status Filter */}
          <CustomDropdown
            label=""
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "Draft", label: "Draft", icon: <FileText className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} /> },
              { value: "Pending Pricing", label: "Pending Pricing", icon: <Clock className="w-3.5 h-3.5" style={{ color: "var(--theme-status-warning-fg)" }} /> },
              { value: "Quoted", label: "Quoted", icon: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--neuron-semantic-info)" }} /> },
              { value: "Sent", label: "Sent", icon: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--neuron-semantic-info)" }} /> }
            ]}
          />
        </div>

        {/* Create Button */}
        {onCreateInquiry && (
          <CreateQuotationMenu
            buttonText="New Inquiry"
            entityWord="Inquiry"
            onSelect={onCreateInquiry}
          />
        )}
      </div>

      {filteredInquiries.length === 0 ? (
        <div className="text-center py-12 rounded-lg border" style={{ borderColor: "var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}>
          {inquiries.length === 0 ? (
            <>
              <FileText size={48} style={{ color: "var(--theme-border-default)", margin: "0 auto 16px" }} />
              <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>No Inquiries Yet</p>
              {onCreateInquiry && (
                <div className="mt-4 inline-flex">
                  <CreateQuotationMenu
                    buttonText="Create first inquiry"
                    entityWord="Inquiry"
                    onSelect={onCreateInquiry}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-[14px] font-medium" style={{ color: "var(--theme-text-primary)" }}>No matching inquiries found</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--theme-text-muted)" }}>Try adjusting your search or filters</p>
            </>
          )}
        </div>
      ) : (
        <div 
          className="rounded-lg overflow-hidden"
          style={{ 
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--theme-bg-surface)"
          }}
        >
          {/* Table Header */}
          <div 
            className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_0.8fr_0.8fr] gap-4 px-4 py-3"
            style={{ 
              backgroundColor: "var(--theme-bg-page)",
              borderBottom: "1px solid var(--neuron-ui-divider)"
            }}
          >
            <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
              Inquiry #
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
              Services
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
              Movement
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
              Route
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
              Status
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
              Created
            </div>
          </div>

          {/* Table Rows */}
          <div>
            {filteredInquiries.map(inquiry => {
              const statusStyle = getStatusStyle(inquiry.status);

              return (
                <div
                  key={inquiry.id}
                  className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_0.8fr_0.8fr] gap-4 px-4 py-4 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}
                  onClick={() => onViewInquiry && onViewInquiry(inquiry.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                  }}
                >
                  {/* Inquiry Number */}
                  <div>
                    <div className="text-[13px] font-medium mb-0.5" style={{ color: "var(--theme-text-primary)" }}>
                      {inquiry.quotation_name || inquiry.quote_number}
                    </div>
                    <div className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                      {inquiry.quote_number}
                    </div>
                  </div>

                  {/* Services */}
                  <div className="text-[12px]" style={{ color: "var(--theme-text-secondary)" }}>
                    {inquiry.services.join(", ")}
                  </div>

                  {/* Movement */}
                  <div className="text-[12px]" style={{ color: "var(--theme-text-secondary)" }}>
                    {inquiry.movement}
                  </div>

                  {/* Route */}
                  <div className="text-[12px]" style={{ color: "var(--theme-text-secondary)" }}>
                    {inquiry.pol_aol} → {inquiry.pod_aod}
                  </div>

                  {/* Status */}
                  <div>
                    <span 
                      className="inline-block px-2 py-0.5 rounded text-[11px] font-medium"
                      style={{
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text
                      }}
                    >
                      {inquiry.status}
                    </span>
                  </div>

                  {/* Created Date */}
                  <div className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                    {formatDate(inquiry.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
