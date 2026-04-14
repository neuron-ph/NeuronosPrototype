import { useState, useEffect, useCallback } from "react";
import { NeuronSidebar } from "./NeuronSidebar";

// Environment badge — only shown on deployed builds (import.meta.env.PROD).
// Detects which Supabase project the build is connected to so misconfigured
// preview environments (pointing at prod DB) are immediately visible.
const DEV_PROJECT_ID = "oqermaidggvanahumjmj";
const PROD_PROJECT_ID = "ubspbukgcxmzegnomlgi";

function EnvBadge() {
  if (!import.meta.env.PROD) return null;

  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const isDevDB = url.includes(DEV_PROJECT_ID);
  const isProdDB = url.includes(PROD_PROJECT_ID);

  // Production build hitting prod DB — expected, no badge needed
  if (isProdDB && !window.location.hostname.includes("vercel.app")) return null;

  const label = isDevDB ? "DEV DB" : isProdDB ? "PROD DB" : "UNKNOWN DB";
  const bg = isDevDB ? "#166534" : "#991b1b";
  const dot = isDevDB ? "#86efac" : "#fca5a5";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "12px",
        right: "12px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "999px",
        background: bg,
        color: "#fff",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        pointerEvents: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      {label}
    </div>
  );
}

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

      <EnvBadge />
    </div>
  );
}
