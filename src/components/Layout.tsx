import { useState, useEffect, useCallback } from "react";
import { Menu } from "lucide-react";
import { NeuronSidebar } from "./NeuronSidebar";
import { NeuronLogo } from "./NeuronLogo";

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

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (e.matches) setIsMobileOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("neuron_sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  const toggleCollapse = useCallback(() => setIsCollapsed((v) => !v), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  const handleNavigate = useCallback(
    (page: Page) => {
      setIsMobileOpen(false);
      onNavigate(page);
    },
    [onNavigate]
  );

  return (
    <div
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: "var(--neuron-bg-page)" }}
    >
      {/* Mobile top bar — visible only below lg (1024px) */}
      {!isDesktop && (
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{
            height: "56px",
            backgroundColor: "var(--neuron-bg-elevated)",
            borderBottom: "1px solid var(--neuron-ui-border)",
          }}
        >
          <button
            onClick={() => setIsMobileOpen(true)}
            className="flex items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
            style={{ width: "36px", height: "36px", color: "var(--neuron-ink-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Menu size={20} />
          </button>
          <NeuronLogo
            height={22}
            className="cursor-pointer"
            onClick={() => handleNavigate("dashboard")}
          />
          {/* Balance spacer so logo is visually centered */}
          <div style={{ width: "36px" }} />
        </div>
      )}

      {/* Sidebar + Main content grid */}
      <div
        className="flex-1 min-h-0"
        style={{
          display: "grid",
          gridTemplateColumns: isDesktop
            ? isCollapsed
              ? "72px 1fr"
              : "272px 1fr"
            : "1fr",
          gridTemplateRows: "1fr",
          height: "100%",
          transition: isDesktop
            ? "grid-template-columns 0.25s cubic-bezier(0.25, 1, 0.5, 1)"
            : "none",
        }}
      >
        <NeuronSidebar
          currentPage={currentPage as any}
          onNavigate={handleNavigate as any}
          currentUser={currentUser}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          isDesktop={isDesktop}
          isMobileOpen={isMobileOpen}
          onMobileClose={closeMobile}
        />

        <main className="min-h-0 h-full overflow-y-auto overflow-x-auto">
          {children}
        </main>
      </div>

      {/* Mobile backdrop — closes sidebar on tap outside */}
      {!isDesktop && isMobileOpen && (
        <div
          className="fixed inset-0"
          style={{ backgroundColor: "rgba(18, 51, 43, 0.45)", zIndex: 49 }}
          onClick={closeMobile}
        />
      )}

      <EnvBadge />
    </div>
  );
}
