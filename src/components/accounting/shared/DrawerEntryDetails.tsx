import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "../../ui/drawer";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Separator } from "../../ui/separator";
import { Edit2, CheckCircle, XCircle, Trash2, Download, Calendar, Building2, Wallet, User, FileText } from "lucide-react";
import { format } from "date-fns";
import { EntryType, BadgeType } from "./BadgeType";
import { AccountingEntry } from "./TableAccountingEntries";
import { NeuronModal } from "../../ui/NeuronModal";

interface DrawerEntryDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: AccountingEntry | null;
  onEdit?: (entry: AccountingEntry) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function DrawerEntryDetails({
  open,
  onOpenChange,
  entry,
  onEdit,
  onApprove,
  onReject,
  onDelete,
}: DrawerEntryDetailsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!entry) return null;

  const canEdit = entry.status === "Pending";
  const canApprove = entry.status === "Pending";
  const canDelete = entry.status === "Pending";

  const handleEdit = () => {
    onEdit?.(entry);
    onOpenChange(false);
  };

  const handleApprove = () => {
    onApprove?.(entry.id);
    onOpenChange(false);
  };

  const handleReject = () => {
    onReject?.(entry.id);
    onOpenChange(false);
  };

  const handleDelete = () => setDeleteOpen(true);

  const handleDeleteConfirm = () => {
    onDelete?.(entry.id);
    onOpenChange(false);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      Pending: "bg-orange-100 text-orange-800 border-orange-200",
      Approved: "bg-[var(--theme-status-success-bg)] text-green-800 border-[var(--theme-status-success-border)]",
      Rejected: "bg-[var(--theme-status-danger-bg)] text-red-800 border-[var(--theme-status-danger-border)]",
    };
    return (
      <Badge className={`${styles[status as keyof typeof styles]} border text-[12px] px-2 py-0.5`} style={{ borderRadius: 'var(--radius-xs)' }}>
        {status}
      </Badge>
    );
  };

  const formatAmount = (amount: number, type: EntryType) => {
    const formatted = `₱${amount.toLocaleString()}`;
    if (type === "revenue") return `+${formatted}`;
    if (type === "expense") return `-${formatted}`;
    return formatted;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-[600px] mx-auto">
        <DrawerHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DrawerTitle className="text-[var(--theme-text-primary)] mb-2">Entry Details</DrawerTitle>
              <DrawerDescription className="flex items-center gap-2">
                <BadgeType type={entry.type} />
                {getStatusBadge(entry.status)}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-6 pb-6 space-y-6">
          {/* Amount - Large Display */}
          <div className="text-center py-4">
            <div 
              className="text-[32px] tabular-nums"
              style={{ 
                color: entry.type === "revenue" ? "var(--text-revenue)" : entry.type === "expense" ? "var(--text-expense)" : "#374151" 
              }}
            >
              {formatAmount(entry.amount, entry.type)}
            </div>
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Date */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[12px] text-[var(--theme-text-muted)]">
                <Calendar className="w-4 h-4" />
                Date
              </div>
              <div className="text-[14px] text-[var(--theme-text-secondary)]">
                {format(new Date(entry.date), "MMM d, yyyy")}
              </div>
            </div>

            {/* Booking No */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[12px] text-[var(--theme-text-muted)]">
                <FileText className="w-4 h-4" />
                Booking No
              </div>
              <div className="text-[14px] text-[var(--theme-text-primary)] font-medium">
                {entry.bookingNo}
              </div>
            </div>

            {/* Client */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[12px] text-[var(--theme-text-muted)]">
                <Building2 className="w-4 h-4" />
                Client
              </div>
              <div className="text-[14px] text-[var(--theme-text-secondary)]">
                {entry.client}
              </div>
            </div>

            {/* Account */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[12px] text-[var(--theme-text-muted)]">
                <Wallet className="w-4 h-4" />
                Account
              </div>
              <div className="text-[14px] text-[var(--theme-text-secondary)]">
                {entry.account}
              </div>
            </div>

            {/* Category (if not transfer) */}
            {entry.category && (
              <div className="space-y-1">
                <div className="text-[12px] text-[var(--theme-text-muted)]">Category</div>
                <div className="text-[14px] text-[var(--theme-text-secondary)]">
                  {entry.category}
                </div>
              </div>
            )}

            {/* Entered By */}
            {entry.enteredBy && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[12px] text-[var(--theme-text-muted)]">
                  <User className="w-4 h-4" />
                  Entered By
                </div>
                <div className="text-[14px] text-[var(--theme-text-secondary)]">
                  {entry.enteredBy}
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          {entry.note && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-[12px] text-[var(--theme-text-muted)]">Note</div>
                <div className="text-[14px] text-[var(--theme-text-secondary)] p-3 bg-[var(--theme-bg-page)] rounded-lg">
                  {entry.note}
                </div>
              </div>
            </>
          )}

          {/* Attachment */}
          {(entry as any).attachment && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-[12px] text-[var(--theme-text-muted)]">Attachment</div>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  style={{ borderRadius: 'var(--radius-sm)' }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {(entry as any).attachment}
                </Button>
              </div>
            </>
          )}
        </div>

        <DrawerFooter className="border-t border-[var(--theme-border-default)]">
          <div className="flex gap-3 w-full">
            {/* Edit Button */}
            {canEdit && onEdit && (
              <Button
                variant="outline"
                onClick={handleEdit}
                className="flex-1"
                style={{ borderRadius: 'var(--radius-sm)' }}
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}

            {/* Approve Button */}
            {canApprove && onApprove && (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={handleApprove}
                style={{ borderRadius: 'var(--radius-sm)' }}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
              </Button>
            )}

            {/* Reject Button */}
            {canApprove && onReject && (
              <Button
                variant="outline"
                onClick={handleReject}
                className="flex-1 text-[var(--theme-status-danger-fg)] border-[var(--theme-status-danger-border)] hover:bg-[var(--theme-status-danger-bg)]"
                style={{ borderRadius: 'var(--radius-sm)' }}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            )}

            {/* Delete Button */}
            {canDelete && onDelete && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                className="text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)]"
                style={{ borderRadius: 'var(--radius-sm)' }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
      <NeuronModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete entry?"
        description="This will permanently remove the entry and cannot be undone."
        confirmLabel="Delete Entry"
        onConfirm={handleDeleteConfirm}
        variant="danger"
      />
    </Drawer>
  );
}
