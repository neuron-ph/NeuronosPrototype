import { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Plus, Inbox } from "lucide-react";
import {
  CommandBarAccounting,
  TabsAccounting,
  FilterBarSticky,
  ModalNewEntry,
  DrawerEntryDetails,
  AccountingEntry,
  AccountingTabValue,
} from "./shared";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "../ui/table";
import { BadgeType } from "./shared/BadgeType";
import { NeuronModal } from "../ui/NeuronModal";

export function EntriesPageNew() {
  // Global state
  const [company, setCompany] = useState("jjb");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<AccountingTabValue>("entries");

  // Filter state
  const [filters, setFilters] = useState({
    bookingNo: "",
    client: "",
    company: [] as string[],
    type: "",
    account: "",
    category: "",
    dateRange: {} as { from?: Date; to?: Date },
    status: "all",
    enteredBy: "",
  });

  // Modal/Drawer state
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AccountingEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);

  // Keyboard navigation state
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const [deleteEntryOpen, setDeleteEntryOpen] = useState(false);

  // Mock data - Replace with actual API calls
  const [entries, setEntries] = useState<AccountingEntry[]>([
    {
      id: "1",
      bookingNo: "ND-2025-001",
      client: "ABC Corp",
      type: "expense",
      amount: 5000,
      account: "Cash",
      category: "Fuel",
      date: "2025-10-20",
      note: "Diesel fuel for long-haul route",
      status: "Approved",
      enteredBy: "John Doe",
    },
    {
      id: "2",
      bookingNo: "ND-2025-002",
      client: "XYZ Inc",
      type: "revenue",
      amount: 15000,
      account: "Bank - BPI",
      category: "Transport Services",
      date: "2025-10-21",
      note: "Payment for delivery services",
      status: "Pending",
      enteredBy: "Jane Smith",
    },
    {
      id: "3",
      bookingNo: "ND-2025-003",
      client: "Demo Client",
      type: "transfer",
      amount: 10000,
      account: "Cash → Bank",
      date: "2025-10-22",
      note: "Cash deposit to bank account",
      status: "Approved",
      enteredBy: "John Doe",
    },
  ]);

  // Filter entries
  const filteredEntries = entries.filter((entry) => {
    if (filters.bookingNo && !entry.bookingNo.toLowerCase().includes(filters.bookingNo.toLowerCase())) return false;
    if (filters.client && !entry.client.toLowerCase().includes(filters.client.toLowerCase())) return false;
    if (filters.company.length > 0) return false; // Implement company filtering
    if (filters.type && filters.type !== "all" && entry.type !== filters.type) return false;
    if (filters.account && entry.account !== filters.account) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.status && filters.status !== "all" && entry.status !== filters.status) return false;
    if (filters.enteredBy && entry.enteredBy !== filters.enteredBy) return false;
    if (searchQuery && !JSON.stringify(entry).toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Calculate totals for filtered entries
  const totals = filteredEntries.reduce(
    (acc, entry) => {
      if (entry.type === "revenue") {
        acc.revenue += entry.amount;
      } else if (entry.type === "expense") {
        acc.expense += entry.amount;
      } else if (entry.type === "transfer") {
        acc.transfer += entry.amount;
      }
      return acc;
    },
    { revenue: 0, expense: 0, transfer: 0 }
  );

  // Handle new entry save
  const handleSaveEntry = (data: any) => {
    if (editingEntry) {
      // Update existing entry
      const updatedEntry: AccountingEntry = {
        ...editingEntry,
        type: data.type,
        amount: parseFloat(data.amount),
        account: data.account,
        category: data.category,
        client: data.client || editingEntry.client,
        bookingNo: data.bookingNo || editingEntry.bookingNo,
        date: data.date.toISOString().split("T")[0],
        note: data.note,
      };
      setEntries(entries.map((e) => (e.id === editingEntry.id ? updatedEntry : e)));
      setEditingEntry(null);
    } else {
      // Create new entry
      const newEntry: AccountingEntry = {
        id: Date.now().toString(),
        bookingNo: data.bookingNo || "ND-2025-NEW",
        client: data.client || "Unknown",
        type: data.type,
        amount: parseFloat(data.amount),
        account: data.account,
        category: data.category,
        date: data.date.toISOString().split("T")[0],
        note: data.note,
        status: "Pending",
        enteredBy: "Current User",
      };

      // Insert at top
      setEntries([newEntry, ...entries]);
    }
  };

  // Handle edit
  const handleEdit = (entry: AccountingEntry) => {
    setEditingEntry(entry);
    setIsDrawerOpen(false);
    setIsNewEntryOpen(true);
  };

  // Handle approve
  const handleApprove = (id: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, status: "Approved" } : e)));
  };

  // Handle reject
  const handleReject = (id: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, status: "Rejected" } : e)));
  };

  // Handle delete
  const handleDelete = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleDeleteEntryConfirm = () => {
    const currentEntry = selectedRowIndex >= 0 ? filteredEntries[selectedRowIndex] : null;
    if (currentEntry) {
      handleDelete(currentEntry.id);
      setSelectedRowIndex(-1);
    }
  };

  // Handle row click
  const handleRowClick = (entry: AccountingEntry, index: number) => {
    setSelectedEntry(entry);
    setSelectedRowIndex(index);
    setIsDrawerOpen(true);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard shortcuts when modal or input is focused
      if (isNewEntryOpen || isDrawerOpen) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;

      const currentEntry = selectedRowIndex >= 0 ? filteredEntries[selectedRowIndex] : null;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedRowIndex((prev) => Math.min(prev + 1, filteredEntries.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (currentEntry) {
            setSelectedEntry(currentEntry);
            setIsDrawerOpen(true);
          }
          break;
        case "e":
        case "E":
          e.preventDefault();
          if (currentEntry && currentEntry.status === "Pending") {
            handleEdit(currentEntry);
          }
          break;
        case "a":
        case "A":
          e.preventDefault();
          if (currentEntry && currentEntry.status === "Pending") {
            handleApprove(currentEntry.id);
          }
          break;
        case "r":
        case "R":
          e.preventDefault();
          if (currentEntry && currentEntry.status === "Pending") {
            handleReject(currentEntry.id);
          }
          break;
        case "Delete":
          e.preventDefault();
          if (currentEntry && currentEntry.status === "Pending") {
            setDeleteEntryOpen(true);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNewEntryOpen, isDrawerOpen, selectedRowIndex, filteredEntries]);

  // Clear filters handler
  const handleClearFilters = () => {
    setFilters({
      bookingNo: "",
      client: "",
      company: [],
      type: "",
      account: "",
      category: "",
      dateRange: {},
      status: "all",
      enteredBy: "",
    });
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      Pending: "bg-orange-100 text-orange-800 border-orange-200",
      Approved: "bg-[var(--theme-status-success-bg)] text-green-800 border-[var(--theme-status-success-border)]",
      Rejected: "bg-[var(--theme-status-danger-bg)] text-red-800 border-[var(--theme-status-danger-border)]",
    };
    return (
      <div className={`inline-flex px-2 py-0.5 border text-[12px] ${styles[status as keyof typeof styles]}`} style={{ borderRadius: 'var(--radius-xs)' }}>
        {status}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[var(--theme-bg-surface)] overflow-hidden">
      {/* Command Bar - Persistent */}
      <CommandBarAccounting
        company={company}
        onCompanyChange={setCompany}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewEntry={() => {
          setEditingEntry(null);
          setIsNewEntryOpen(true);
        }}
        companyOptions={[
          { value: "jjb", label: "JJB Group" },
          { value: "subsidiary", label: "JJB Subsidiary" },
          { value: "logistics", label: "JJB Logistics" },
        ]}
      />

      {/* Tabs Navigation */}
      <TabsAccounting active={activeTab} onTabChange={setActiveTab} showIcons={true} />

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Sticky Filter Bar */}
        <FilterBarSticky
          bookingNo={filters.bookingNo}
          onBookingNoChange={(value) => setFilters({ ...filters, bookingNo: value })}
          client={filters.client}
          onClientChange={(value) => setFilters({ ...filters, client: value })}
          company={filters.company}
          onCompanyChange={(values) => setFilters({ ...filters, company: values })}
          type={filters.type}
          onTypeChange={(value) => setFilters({ ...filters, type: value })}
          account={filters.account}
          onAccountChange={(value) => setFilters({ ...filters, account: value })}
          category={filters.category}
          onCategoryChange={(value) => setFilters({ ...filters, category: value })}
          dateRange={filters.dateRange}
          onDateRangeChange={(range) => setFilters({ ...filters, dateRange: range })}
          status={filters.status}
          onStatusChange={(value) => setFilters({ ...filters, status: value })}
          enteredBy={filters.enteredBy}
          onEnteredByChange={(value) => setFilters({ ...filters, enteredBy: value })}
          onClearFilters={handleClearFilters}
          bookingNoOptions={["ND-2025-001", "ND-2025-002", "ND-2025-003"]}
          clientOptions={["ABC Corp", "XYZ Inc", "Demo Client"]}
          companyOptions={[
            { value: "jjb", label: "JJB Group" },
            { value: "subsidiary", label: "JJB Subsidiary" },
          ]}
          accountOptions={[
            { value: "cash", label: "Cash" },
            { value: "bank", label: "Bank - BPI" },
          ]}
          categoryOptions={[
            { value: "fuel", label: "Fuel" },
            { value: "transport", label: "Transport Services" },
          ]}
          userOptions={[
            { value: "john", label: "John Doe" },
            { value: "jane", label: "Jane Smith" },
          ]}
          variant="default"
        />

        {/* Page Content */}
        <div className="max-w-[1200px] mx-auto px-6 py-6">
          {filteredEntries.length === 0 ? (
            // Empty State
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 bg-[var(--theme-bg-page)] rounded-full flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-[var(--theme-text-muted)]" />
              </div>
              <h3 className="text-[var(--theme-text-primary)] mb-2">No entries found</h3>
              <p className="text-[14px] text-[var(--theme-text-muted)] mb-6">
                {entries.length === 0
                  ? "Add your first entry to get started"
                  : "No entries match your filters. Try adjusting them."}
              </p>
              <Button
                className="bg-[#F25C05] hover:bg-[#D84D00] text-white"
                onClick={() => {
                  if (entries.length === 0) {
                    setIsNewEntryOpen(true);
                  } else {
                    handleClearFilters();
                  }
                }}
                style={{ borderRadius: 'var(--radius-sm)' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {entries.length === 0 ? "New Entry" : "Clear Filters"}
              </Button>
            </div>
          ) : (
            // Entries Table
            <div className="border border-[var(--theme-border-default)]" style={{ borderRadius: 'var(--radius-sm)' }}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--theme-bg-page)] border-b border-[var(--theme-border-default)]">
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Date</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Booking No</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Client</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Type</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10 text-right">Amount</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Account</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Category</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Note</TableHead>
                    <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-10">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry, index) => (
                    <TableRow
                      key={entry.id}
                      className={`border-b border-[var(--theme-border-default)] hover:bg-[var(--theme-bg-page)] cursor-pointer transition-colors ${
                        selectedRowIndex === index ? "bg-orange-50 hover:bg-orange-50" : ""
                      }`}
                      onClick={() => handleRowClick(entry, index)}
                    >
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">
                        {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-primary)] font-medium">
                        {entry.bookingNo}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">{entry.client}</TableCell>
                      <TableCell>
                        <BadgeType type={entry.type} />
                      </TableCell>
                      <TableCell
                        className="text-[14px] text-right tabular-nums"
                        style={{
                          color:
                            entry.type === "revenue"
                              ? "var(--text-revenue)"
                              : entry.type === "expense"
                              ? "var(--text-expense)"
                              : "#374151",
                        }}
                      >
                        {entry.type === "revenue" && "+"}
                        {entry.type === "expense" && "-"}₱{entry.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">{entry.account}</TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-muted)]">{entry.category || "—"}</TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-muted)] max-w-[200px] truncate">
                        {entry.note || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entry.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-[var(--theme-bg-page)] border-t-2 border-[var(--theme-border-default)]">
                    <TableCell colSpan={4} className="text-[14px] text-[var(--theme-text-secondary)]">
                      Total ({filteredEntries.length} entries)
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        {totals.revenue > 0 && (
                          <div className="text-[14px] tabular-nums" style={{ color: "var(--text-revenue)" }}>
                            +₱{totals.revenue.toLocaleString()}
                          </div>
                        )}
                        {totals.expense > 0 && (
                          <div className="text-[14px] tabular-nums" style={{ color: "var(--text-expense)" }}>
                            -₱{totals.expense.toLocaleString()}
                          </div>
                        )}
                        {totals.transfer > 0 && (
                          <div className="text-[14px] text-[var(--theme-text-secondary)] tabular-nums">
                            ₱{totals.transfer.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {/* Keyboard Shortcuts Hint */}
          <div className="mt-4 text-[12px] text-[var(--theme-text-muted)] flex gap-4">
            <span>↑↓ Navigate</span>
            <span>Enter View</span>
            <span>E Edit</span>
            <span>A Approve</span>
            <span>R Reject</span>
            <span>Del Delete</span>
          </div>
        </div>
      </div>

      {/* New Entry Modal */}
      <ModalNewEntry
        open={isNewEntryOpen}
        onOpenChange={setIsNewEntryOpen}
        onSave={handleSaveEntry}
        initialData={editingEntry ? {
          type: editingEntry.type,
          amount: editingEntry.amount.toString(),
          date: new Date(editingEntry.date),
          company: "jjb",
          account: editingEntry.account,
          category: editingEntry.category,
          client: editingEntry.client,
          bookingNo: editingEntry.bookingNo,
          note: editingEntry.note,
        } : undefined}
        companyOptions={[
          { value: "jjb", label: "JJB Group" },
          { value: "subsidiary", label: "JJB Subsidiary" },
        ]}
        accountOptions={[
          { value: "cash", label: "Cash" },
          { value: "bank", label: "Bank - BPI" },
        ]}
        categoryOptions={[
          { value: "fuel", label: "Fuel" },
          { value: "transport", label: "Transport Services" },
        ]}
        clientOptions={[
          { value: "abc", label: "ABC Corp" },
          { value: "xyz", label: "XYZ Inc" },
        ]}
        bookingOptions={[
          { value: "ND-2025-001", label: "ND-2025-001" },
          { value: "ND-2025-002", label: "ND-2025-002" },
        ]}
      />

      <NeuronModal
        isOpen={deleteEntryOpen}
        onClose={() => setDeleteEntryOpen(false)}
        title="Delete this entry?"
        description="This will permanently remove the entry and cannot be undone."
        confirmLabel="Delete Entry"
        onConfirm={handleDeleteEntryConfirm}
        variant="danger"
      />

      {/* Entry Details Drawer */}
      <DrawerEntryDetails
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        entry={selectedEntry}
        onEdit={handleEdit}
        onApprove={handleApprove}
        onReject={handleReject}
        onDelete={handleDelete}
      />
    </div>
  );
}
