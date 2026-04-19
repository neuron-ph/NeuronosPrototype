import { usePermission } from "../../context/PermissionProvider";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Check, X } from "lucide-react";

interface Expense {
  id: string;
  bookingId: string;
  bookingNo: string;
  type: string;
  amount: number;
  description?: string;
  date: string;
  status: "Pending" | "Approved" | "Rejected";
  enteredBy: string;
}

interface Payment {
  id: string;
  bookingId: string;
  bookingNo: string;
  amount: number;
  date: string;
  method: string;
  status: "Pending" | "Approved" | "Rejected";
}

interface ApprovalsPageProps {
  expenses: Expense[];
  payments: Payment[];
  onApproveExpense: (id: string) => void;
  onRejectExpense: (id: string) => void;
  onApprovePayment: (id: string) => void;
  onRejectPayment: (id: string) => void;
}

export function ApprovalsPage({
  expenses,
  payments,
  onApproveExpense,
  onRejectExpense,
  onApprovePayment,
  onRejectPayment,
}: ApprovalsPageProps) {
  const { can } = usePermission();
  const canExpenses = can("accounting_approvals_expenses_tab", "view");
  const canPayments = can("accounting_approvals_payments_tab", "view");
  const defaultTab = canExpenses ? "expenses" : canPayments ? "payments" : "expenses";

  const pendingExpenses = expenses.filter((e) => e.status === "Pending");
  const pendingPayments = payments.filter((p) => p.status === "Pending");

  const StatusBadge = ({ status }: { status: string }) => {
    const colors = {
      Pending: "bg-orange-100 text-orange-800 border-orange-200",
      Approved: "bg-[var(--theme-status-success-bg)] text-green-800 border-[var(--theme-status-success-border)]",
      Rejected: "bg-[var(--theme-status-danger-bg)] text-red-800 border-[var(--theme-status-danger-border)]",
    };
    return (
      <Badge className={`${colors[status as keyof typeof colors]} border text-xs px-2 py-0.5`} style={{ borderRadius: 'var(--radius-xs)' }}>
        {status}
      </Badge>
    );
  };

  return (
    <>
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-[var(--theme-text-primary)] mb-2">Approvals</h1>
        <p className="text-[14px] text-[var(--theme-text-muted)] leading-[20px]">
          Review and approve pending expenses and payments
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="bg-[var(--theme-bg-page)] p-1 mb-6 h-10" style={{ borderRadius: 'var(--radius-sm)' }}>
          {canExpenses && (
            <TabsTrigger
              value="expenses"
              className="text-[14px] h-8 px-4 data-[state=active]:bg-[var(--theme-bg-surface)]"
              style={{ borderRadius: 'var(--radius-xs)' }}
            >
              Expenses ({pendingExpenses.length})
            </TabsTrigger>
          )}
          {canPayments && (
            <TabsTrigger
              value="payments"
              className="text-[14px] h-8 px-4 data-[state=active]:bg-[var(--theme-bg-surface)]"
              style={{ borderRadius: 'var(--radius-xs)' }}
            >
              Payments ({pendingPayments.length})
            </TabsTrigger>
          )}
        </TabsList>

        {canExpenses && <TabsContent value="expenses">
          <div className="border border-[var(--theme-border-default)] overflow-hidden" style={{ borderRadius: 'var(--radius-sm)' }}>
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--theme-bg-page)] border-b border-[var(--theme-border-default)]">
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Date</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Booking</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Type</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12 text-right">Amount</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Description</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Entered By</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[14px] text-[var(--theme-text-muted)] h-24">
                      No pending expenses
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingExpenses.map((expense) => (
                    <TableRow 
                      key={expense.id} 
                      className="border-b border-[var(--theme-border-default)] hover:bg-[var(--theme-bg-page)]"
                      style={{ minHeight: '48px' }}
                    >
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">
                        {new Date(expense.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-primary)] font-medium">
                        {expense.bookingNo}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">
                        {expense.type}
                      </TableCell>
                      <TableCell className="text-[14px] text-right font-medium tabular-nums" style={{ color: 'var(--text-expense)' }}>
                        ₱{expense.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-muted)] max-w-[200px] truncate">
                        {expense.description || "—"}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">
                        {expense.enteredBy}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                            style={{ borderRadius: 'var(--radius-xs)' }}
                            onClick={() => onApproveExpense(expense.id)}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-[var(--theme-status-danger-border)] text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] h-8 px-3"
                            style={{ borderRadius: 'var(--radius-xs)' }}
                            onClick={() => onRejectExpense(expense.id)}
                          >
                            <X className="w-3.5 h-3.5 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>}

        {canPayments && <TabsContent value="payments">
          <div className="border border-[var(--theme-border-default)] overflow-hidden" style={{ borderRadius: 'var(--radius-sm)' }}>
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--theme-bg-page)] border-b border-[var(--theme-border-default)]">
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Date</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Booking</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12">Method</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12 text-right">Amount</TableHead>
                  <TableHead className="text-[12px] text-[var(--theme-text-muted)] h-12 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-[14px] text-[var(--theme-text-muted)] h-24">
                      No pending payments
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingPayments.map((payment) => (
                    <TableRow 
                      key={payment.id} 
                      className="border-b border-[var(--theme-border-default)] hover:bg-[var(--theme-bg-page)]"
                      style={{ minHeight: '48px' }}
                    >
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">
                        {new Date(payment.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-primary)] font-medium">
                        {payment.bookingNo}
                      </TableCell>
                      <TableCell className="text-[14px] text-[var(--theme-text-secondary)]">
                        {payment.method}
                      </TableCell>
                      <TableCell className="text-[14px] text-right font-medium tabular-nums" style={{ color: 'var(--text-revenue)' }}>
                        ₱{payment.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                            style={{ borderRadius: 'var(--radius-xs)' }}
                            onClick={() => onApprovePayment(payment.id)}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-[var(--theme-status-danger-border)] text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] h-8 px-3"
                            style={{ borderRadius: 'var(--radius-xs)' }}
                            onClick={() => onRejectPayment(payment.id)}
                          >
                            <X className="w-3.5 h-3.5 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>}
      </Tabs>
    </>
  );
}
