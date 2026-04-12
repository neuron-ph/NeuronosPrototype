import { useState, useEffect } from "react";
import { Plus, Banknote, Clock, CheckCircle, Archive, Users } from "lucide-react";
import { CreateEVoucherForm } from "./evouchers/CreateEVoucherForm";
import { EVoucherDetailView } from "./EVoucherDetailView";
import { UnifiedEVouchersTable } from "./evouchers/UnifiedEVouchersTable";
import { useEVouchers } from "../../hooks/useEVouchers";
import { NeuronRefreshButton } from "../shared/NeuronRefreshButton";

type AccountingTab = "acct-pending-disburse" | "acct-waiting-on-rep" | "acct-pending-verification" | "acct-archive";

const TABS: { id: AccountingTab; label: string; icon: typeof Banknote; description: string }[] = [
  { id: "acct-pending-disburse", label: "Pending Disburse", icon: Banknote, description: "Ready to release cash" },
  { id: "acct-waiting-on-rep", label: "Waiting on Rep", icon: Clock, description: "Rep hasn't submitted receipts" },
  { id: "acct-pending-verification", label: "Pending Verification", icon: CheckCircle, description: "Receipts in, ready to verify & post" },
  { id: "acct-archive", label: "Archive", icon: Archive, description: "Posted & completed" },
];

export function EVouchersContent() {
  const [activeTab, setActiveTab] = useState<AccountingTab>("acct-pending-disburse");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvoucher, setSelectedEvoucher] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const userData = localStorage.getItem("neuron_user");
  const currentUser = userData ? JSON.parse(userData) : null;

  const { evouchers, isLoading, refresh } = useEVouchers(activeTab, currentUser?.id);

  useEffect(() => {
    if (refreshTrigger > 0) refresh();
  }, [refreshTrigger, refresh]);

  // Map accounting tab to a view name the table component understands
  const tableView = activeTab === "acct-archive" ? "all" : "pending";

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">
      {/* Header */}
      <div className="px-12 pt-8 pb-0">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
              E-Vouchers
            </h1>
            <p className="text-[14px] text-[var(--theme-text-muted)]">
              Manage disbursements, verify receipts, and post to the general ledger
            </p>
          </div>
          <div className="flex items-center gap-3">
            <NeuronRefreshButton onRefresh={async () => refresh()} label="Refresh e-vouchers" />
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[#0D6559] transition-colors font-medium text-[14px]"
            >
              <Plus size={16} />
              New E-Voucher
            </button>
          </div>
        </div>

        {/* 4-Tab Navigation */}
        <div className="flex items-center gap-8 border-b border-[var(--theme-border-default)]">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 relative group ${isActive ? "text-[var(--theme-action-primary-bg)]" : "text-[var(--theme-text-muted)]"}`}
                title={tab.description}
              >
                <TabIcon size={18} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[14px] ${isActive ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
                {evouchers.length > 0 && isActive && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: "10px",
                      backgroundColor: "var(--theme-bg-surface-tint)",
                      color: "var(--theme-action-primary-bg)",
                    }}
                  >
                    {evouchers.length}
                  </span>
                )}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--theme-action-primary-bg)] rounded-t-[2px]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-12 overflow-auto bg-[var(--theme-bg-surface)]">
        {!currentUser ? (
          <div className="py-12 text-center text-[var(--theme-text-muted)]">
            <Users size={48} className="mx-auto mb-4 text-[var(--neuron-ui-muted)]" />
            <h3 className="text-[16px] font-semibold text-[var(--theme-text-secondary)] mb-2">Please Log In</h3>
            <p className="text-[14px]">You need to be logged in to view E-Vouchers</p>
          </div>
        ) : (
          <UnifiedEVouchersTable
            evouchers={evouchers}
            view={tableView}
            onViewDetail={setSelectedEvoucher}
            onRefresh={refresh}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateEVoucherForm
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          context="accounting"
          defaultRequestor={currentUser?.name}
          onSuccess={() => {
            setShowCreateModal(false);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}

      {selectedEvoucher && (
        <EVoucherDetailView
          evoucher={selectedEvoucher}
          onClose={() => setSelectedEvoucher(null)}
          currentUser={currentUser}
          onStatusChange={() => {
            setSelectedEvoucher(null);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
