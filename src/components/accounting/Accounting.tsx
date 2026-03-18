import { EVouchersContent } from "./EVouchersContent";
import { CollectionsContentNew } from "./CollectionsContentNew";
import { BillingsContentNew } from "./BillingsContentNew";
import { ExpensesPageNew } from "./ExpensesPageNew";
import { ChartOfAccounts } from "./coa/ChartOfAccounts";
import { FinancialReports } from "./reports/FinancialReports";
import { ProjectsModule } from "../projects/ProjectsModule";
import { ContractsModule } from "../contracts/ContractsModule";
import { AccountingCustomers } from "./AccountingCustomers";
import { TransactionsModule } from "../transactions/TransactionsModule";
import { AuditingModule } from "./AuditingModule";
import { AggregateInvoicesPage } from "./AggregateInvoicesPage";
import { FinancialHealthPage } from "./reports/FinancialHealthPage";
import { ReportsModule } from "./reports/ReportsModule";
import { FinancialsModule } from "./FinancialsModule";
import { AccountingBookingsShell } from "./AccountingBookingsShell";
import { useAppMode } from "../../config/appMode";

type AccountingView = "evouchers" | "billings" | "invoices" | "collections" | "expenses" | "ledger" | "reports" | "coa" | "projects" | "contracts" | "customers" | "bookings" | "transactions" | "catalog" | "financials";

export function Accounting({ view }: { view: AccountingView }) {
  const { isEssentials } = useAppMode();

  // Financials super-module (Essentials mode: replaces individual Billings/Invoices/Collections/Expenses pages)
  if (view === "financials") {
    return <FinancialsModule />;
  }

  // Route to appropriate sub-module
  if (view === "transactions") {
    return <TransactionsModule />;
  }

  if (view === "catalog") {
    return <AuditingModule />;
  }

  if (view === "evouchers") {
    return <EVouchersContent />;
  }
  
  if (view === "expenses") {
    // Essentials mode: redirect to FinancialsModule (Expenses tab handled there)
    // Full Suite: use original standalone page
    return isEssentials ? <FinancialsModule /> : <ExpensesPageNew />;
  }

  if (view === "collections") {
    return isEssentials ? <FinancialsModule /> : <CollectionsContentNew />;
  }

  if (view === "billings") {
    return isEssentials ? <FinancialsModule /> : <BillingsContentNew />;
  }

  if (view === "invoices") {
    return isEssentials ? <FinancialsModule /> : <AggregateInvoicesPage />;
  }

  if (view === "coa") {
    return <ChartOfAccounts />;
  }

  if (view === "reports") {
    return <ReportsModule />;
  }

  if (view === "projects") {
    return <ProjectsModule departmentOverride="Accounting" />;
  }

  if (view === "contracts") {
    return <ContractsModule departmentOverride="Accounting" />;
  }

  if (view === "bookings") {
    return <AccountingBookingsShell />;
  }

  // "ledger" is being deprecated in favor of "customers", but keeping for now or mapping it
  if (view === "customers" || view === "ledger") {
    return <AccountingCustomers />;
  }

  return (
    <div className="h-full flex items-center justify-center" style={{ background: "var(--neuron-bg-page)" }}>
      <div style={{ 
        padding: "48px",
        textAlign: "center",
        color: "var(--neuron-text-secondary)"
      }}>
        <h2 style={{ 
          fontSize: "24px",
          fontWeight: 600,
          color: "var(--neuron-text-primary)",
          marginBottom: "16px"
        }}>
          Accounting Module: {view}
        </h2>
        <p>This module is under development</p>
      </div>
    </div>
  );
}
