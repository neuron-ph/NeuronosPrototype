import { NeuronSidebar } from "./NeuronSidebar";
import { FeedbackButton } from "./feedback/FeedbackButton";

type Page = "dashboard" | "bd-contacts" | "bd-customers" | "bd-tasks" | "bd-activities" | "bd-budget-requests" | "bd-reports" | "pricing" | "operations" | "acct-transactions" | "acct-evouchers" | "acct-billings" | "acct-collections" | "acct-expenses" | "acct-ledger" | "acct-coa" | "acct-reports" | "acct-projects" | "acct-contracts" | "acct-customers" | "hr" | "calendar" | "inbox" | "profile" | "admin";

interface LayoutProps {
  children: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  currentUser?: { name: string; email: string; department: string };
  onLogout?: () => void;
}

export function Layout({ children, currentPage, onNavigate, currentUser }: LayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--neuron-bg-page)" }}>
      {/* Left Sidebar - Fixed width 272px */}
      <NeuronSidebar 
        currentPage={currentPage as any}
        onNavigate={onNavigate as any}
        currentUser={currentUser}
      />

      {/* Main Content Area - Fills remaining space */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>

      <FeedbackButton />
    </div>
  );
}