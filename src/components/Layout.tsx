import { useState, useEffect, useCallback } from "react";
import { NeuronSidebar } from "./NeuronSidebar";

type Page = "dashboard" | "bd-contacts" | "bd-customers" | "bd-tasks" | "bd-activities" | "bd-budget-requests" | "bd-reports" | "pricing" | "operations" | "acct-transactions" | "acct-evouchers" | "acct-billings" | "acct-collections" | "acct-expenses" | "acct-ledger" | "acct-journal" | "acct-coa" | "acct-reports" | "acct-projects" | "acct-contracts" | "acct-customers" | "hr" | "calendar" | "inbox" | "profile" | "admin";

interface LayoutProps {
  children: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  currentUser?: { name: string; email: string; department: string };
  onLogout?: () => void;
}

export function Layout({ children, currentPage, onNavigate, currentUser }: LayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("neuron_sidebar_collapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("neuron_sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  const toggleCollapse = useCallback(() => setIsCollapsed((v) => !v), []);

  return (
    <div
      className="h-screen overflow-hidden"
      style={{
        display: "grid",
        gridTemplateColumns: isCollapsed ? "72px 1fr" : "272px 1fr",
        transition: "grid-template-columns 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
        background: "var(--neuron-bg-page)",
      }}
    >
      <NeuronSidebar
        currentPage={currentPage as any}
        onNavigate={onNavigate as any}
        currentUser={currentUser}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      {/* Main Content Area - Fills remaining space */}
      <main className="min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
