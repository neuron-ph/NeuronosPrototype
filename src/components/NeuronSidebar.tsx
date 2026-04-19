import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Home,
  Users,
  ShoppingCart,
  Package,
  FileText,
  BarChart3,
  User,
  Calendar,
  Activity,
  Inbox,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  Banknote,
  ListTodo,
  Truck,
  Container,
  Ship,
  Building,
  Briefcase,
  Palette,
  CreditCard,
  Handshake,
  ClipboardCheck,
  Receipt,
  BookOpen,
  ScrollText,
  TrendingUp
} from "lucide-react";
import { NeuronLogo } from "./NeuronLogo";
import { usePermission } from "../context/PermissionProvider";
import { useUser } from "../hooks/useUser";
import { supabase } from "../utils/supabase/client";
import type { ModuleId } from "./admin/permissionsConfig";

// Prefetch lazy module bundles on sidebar hover — React caches the promise so the
// bundle downloads at most once regardless of how many times the user hovers.
const prefetchBD         = () => void import("./BusinessDevelopment");
const prefetchPricing    = () => void import("./Pricing");
const prefetchOperations = () => void import("./Operations");
const prefetchAccounting = () => void import("./accounting/FinancialsModule");
const prefetchInbox      = () => void import("./InboxPage");

type Page = "dashboard" | "bd-contacts" | "bd-customers" | "bd-inquiries" | "projects" | "bd-projects" | "bd-contracts" | "bd-tasks" | "bd-activities" | "bd-budget-requests" |"pricing-contacts" | "pricing-customers" | "pricing-quotations" | "pricing-projects" | "pricing-contracts" | "pricing-vendors" |"ops-forwarding" | "ops-brokerage" | "ops-trucking" | "ops-marine-insurance" | "ops-others" |"operations" | "acct-transactions" | "acct-evouchers" | "acct-billings" | "acct-invoices" | "acct-collections" | "acct-expenses" | "acct-journal" | "acct-coa" | "acct-reports" | "acct-statements" | "acct-projects" | "acct-contracts" | "acct-customers" | "acct-bookings" | "acct-catalog" | "acct-financials" | "hr" | "calendar" | "inbox" | "my-evouchers" | "ticket-queue" | "settings" | "admin-users" | "admin" | "ticket-testing" | "activity-log" | "design-system";

const sidebarPermissionMap: Partial<Record<Page, ModuleId>> = {
  "bd-contacts": "bd_contacts",
  "bd-customers": "bd_customers",
  "bd-tasks": "bd_tasks",
  "bd-activities": "bd_activities",
  "bd-budget-requests": "bd_budget_requests",
  "pricing-quotations": "pricing_quotations",
  "pricing-contracts": "pricing_contracts",
  "acct-evouchers": "acct_evouchers",
  "acct-billings": "acct_billings",
  "acct-collections": "acct_collections",
  "acct-expenses": "acct_expenses",
  "acct-reports": "acct_reports",
  "hr": "hr",
  "activity-log": "exec_activity_log",
  "admin-users": "exec_users",
};

// SVG for Philippine Peso icon
const Vector = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H4"/><path d="M20 7H4"/><path d="M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7"/>
  </svg>
);

interface NeuronSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  currentUser?: { name?: string; email?: string; department?: string; role?: string; avatar_url?: string | null } | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** True when viewport is ≥ lg (1024px). Controls desktop vs mobile overlay rendering. */
  isDesktop?: boolean;
  /** Whether the mobile drawer is open. Only used when isDesktop=false. */
  isMobileOpen?: boolean;
  /** Called when the user taps the close button or backdrop on mobile. */
  onMobileClose?: () => void;
}

// Wrapper component for the Philippine Peso icon
const PesoIcon = ({ size = 20, style }: { size?: number; style?: React.CSSProperties }) => (
  <div 
    style={{ 
      width: size, 
      height: size, 
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: style?.color || 'currentColor'
    } as React.CSSProperties}
  >
    <Vector />
  </div>
);

export function NeuronSidebar({ currentPage, onNavigate, currentUser, isCollapsed: _isCollapsed, onToggleCollapse, isDesktop = true, isMobileOpen = false, onMobileClose }: NeuronSidebarProps) {
  // On mobile (< lg) the sidebar is always shown fully expanded as an overlay drawer.
  // Shadow the prop so all existing JSX references get the effective value automatically.
  const isCollapsed = !isDesktop ? false : _isCollapsed;
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const navRef = useRef<HTMLElement | null>(null);
  const [showTopScrollFade, setShowTopScrollFade] = useState(false);
  const [showBottomScrollFade, setShowBottomScrollFade] = useState(false);
  const scrollRestoredRef = useRef(false);
  
  // Initialize dropdown states from localStorage
  const [isBDExpanded, setIsBDExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('neuron_bd_expanded');
      return saved === 'true';
    }
    return false;
  });
  
  const [isPricingExpanded, setIsPricingExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('neuron_pricing_expanded');
      return saved === 'true';
    }
    return false;
  });
  
  const [isOperationsExpanded, setIsOperationsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('neuron_operations_expanded');
      return saved === 'true';
    }
    return false;
  });
  
  const [isAcctExpanded, setIsAcctExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('neuron_acct_expanded');
      return saved === 'true';
    }
    return false;
  });
  
  // Persist dropdown states to localStorage
  useEffect(() => {
    localStorage.setItem('neuron_bd_expanded', String(isBDExpanded));
  }, [isBDExpanded]);
  
  useEffect(() => {
    localStorage.setItem('neuron_pricing_expanded', String(isPricingExpanded));
  }, [isPricingExpanded]);
  
  useEffect(() => {
    localStorage.setItem('neuron_operations_expanded', String(isOperationsExpanded));
  }, [isOperationsExpanded]);
  
  useEffect(() => {
    localStorage.setItem('neuron_acct_expanded', String(isAcctExpanded));
  }, [isAcctExpanded]);

  const updateScrollFade = useCallback(() => {
    const nav = navRef.current;
    if (!nav) {
      setShowTopScrollFade(false);
      setShowBottomScrollFade(false);
      return;
    }

    const canScroll = nav.scrollHeight > nav.clientHeight + 1;
    const isPastTop = nav.scrollTop > 8;
    const isAtBottom = nav.scrollTop + nav.clientHeight >= nav.scrollHeight - 2;
    setShowTopScrollFade(canScroll && isPastTop);
    setShowBottomScrollFade(canScroll && !isAtBottom);
  }, []);

  // Restore scroll position on mount (sidebar remounts on every route change)
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || scrollRestoredRef.current) return;
    const saved = sessionStorage.getItem("neuron_sidebar_scroll");
    if (saved) {
      nav.scrollTop = Number(saved);
    }
    scrollRestoredRef.current = true;
  }, []);

  // Save scroll position on scroll
  const handleNavScroll = useCallback(() => {
    const nav = navRef.current;
    if (nav) {
      sessionStorage.setItem("neuron_sidebar_scroll", String(nav.scrollTop));
    }
    updateScrollFade();
  }, [updateScrollFade]);

  // Re-check scroll fades after layout changes (expand/collapse),
  // using requestAnimationFrame so the DOM has settled first.
  useEffect(() => {
    const raf = requestAnimationFrame(updateScrollFade);

    const handleResize = () => updateScrollFade();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, [
    updateScrollFade,
    _isCollapsed,
    isBDExpanded,
    isPricingExpanded,
    isOperationsExpanded,
    isAcctExpanded,
    inboxUnreadCount,
  ]);
  
  // Role level map — mirrors RouteGuard so sidebar visibility matches route access
  const ROLE_LEVEL: Record<string, number> = { staff: 0, team_leader: 1, supervisor: 2, manager: 3, executive: 4 };

  // Use effectiveDepartment from context for dev role override support
  const { user, effectiveDepartment, effectiveRole } = useUser();
  const { can, isLoaded: permissionsLoaded } = usePermission();

  // Fetch inbox unread count — with hard timeout so a hung Supabase client
  // doesn't block the main thread or accumulate zombie requests.
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await Promise.race([
        supabase.rpc("get_unread_count", {
          p_user_id: user.id,
          p_dept: effectiveDepartment || "",
          p_role: effectiveRole || "staff",
        }),
        new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 8_000)
        ),
      ]);
      if (data !== null) setInboxUnreadCount(data || 0);
    } catch {
      // Silently ignore — sidebar badge is non-critical
    }
  }, [user, effectiveDepartment, effectiveRole]);

  useEffect(() => {
    fetchUnreadCount();
    // Refresh count every 60s (was 15s — too aggressive for dev connection pool)
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  
  // Determine what modules to show based on effective department
  const userDepartment = effectiveDepartment || currentUser?.department || "Operations";
  const isExecutive = userDepartment === "Executive";
  const isManager = effectiveRole === 'manager';
  const showBD = isExecutive || userDepartment === "Business Development";
  const showPricing = isExecutive || userDepartment === "Pricing";
  const showOperations = isExecutive || userDepartment === "Operations";
  const showAccounting = isExecutive || userDepartment === "Accounting";
  const showHR = !import.meta.env.PROD && (isExecutive || userDepartment === "HR");
  
  // Dashboard - standalone
  const dashboardItem = { id: "dashboard" as Page, label: "Dashboard", icon: Home };
  // const transactionsItem = { id: "transactions" as Page, label: "Transactions", icon: CreditCard };
  
  // Business Development sub-items
  const bdSubItems = [
    { id: "bd-contacts" as Page, label: "Contacts", icon: User },
    { id: "bd-customers" as Page, label: "Customers", icon: Building },
    { id: "bd-inquiries" as Page, label: "Inquiries", icon: ShoppingCart },
    { id: "bd-projects" as Page, label: "Projects", icon: Briefcase },
    { id: "bd-contracts" as Page, label: "Contracts", icon: Handshake },
    { id: "bd-tasks" as Page, label: "Tasks", icon: Package },
    { id: "bd-activities" as Page, label: "Activities", icon: Activity },
    { id: "bd-budget-requests" as Page, label: "Budget Requests", icon: Banknote },
  ];

  // Pricing sub-items
  const pricingSubItems = [
    { id: "pricing-contacts" as Page, label: "Contacts", icon: User },
    { id: "pricing-customers" as Page, label: "Customers", icon: Building },
    { id: "pricing-quotations" as Page, label: "Quotations", icon: FileText },
    { id: "pricing-projects" as Page, label: "Projects", icon: Briefcase },
    { id: "pricing-contracts" as Page, label: "Contracts", icon: Handshake },
    { id: "pricing-vendors" as Page, label: "Vendor", icon: Palette },
  ];

  // Operations sub-items
  const operationsSubItems = [
    { id: "ops-forwarding" as Page, label: "Forwarding", icon: Container },
    { id: "ops-brokerage" as Page, label: "Brokerage", icon: Palette },
    { id: "ops-trucking" as Page, label: "Trucking", icon: Truck },
    { id: "ops-marine-insurance" as Page, label: "Marine Insurance", icon: Ship },
    { id: "ops-others" as Page, label: "Others", icon: FileText },
  ];

  // Accounting sub-items — minRole hides items the user's role can't access (mirrors RouteGuard)
  const acctSubItems: { id: Page; label: string; icon: any; minRole?: string }[] = [
    { id: "acct-financials" as Page, label: "Finance Overview", icon: CreditCard, minRole: "manager" },
    { id: "acct-evouchers" as Page, label: "E-Vouchers", icon: Receipt },
    { id: "acct-journal" as Page, label: "General Journal", icon: ScrollText },
    { id: "acct-coa" as Page, label: "Chart of Accounts", icon: BookOpen },
    { id: "acct-projects" as Page, label: "Projects", icon: Briefcase },
    { id: "acct-contracts" as Page, label: "Contracts", icon: Handshake },
    { id: "acct-bookings" as Page, label: "Bookings", icon: Package },
    { id: "acct-customers" as Page, label: "Customers", icon: Users },
    { id: "acct-catalog" as Page, label: "Catalog", icon: ClipboardCheck },
    { id: "acct-reports" as Page, label: "Reports", icon: BarChart3 },
    { id: "acct-statements" as Page, label: "Financial Statements", icon: TrendingUp },
  ];

  const canViewPage = useCallback((page: Page) => {
    const moduleId = sidebarPermissionMap[page];
    if (!moduleId) return true;
    if (!permissionsLoaded) return false;
    return can(moduleId, "view");
  }, [can, permissionsLoaded]);

  const visibleBdSubItems = bdSubItems.filter((item) => canViewPage(item.id));
  const visiblePricingSubItems = pricingSubItems.filter((item) => canViewPage(item.id));
  const visibleOperationsSubItems = operationsSubItems.filter((item) => canViewPage(item.id));
  const visibleAcctSubItems = acctSubItems
    .filter((item) => {
      if (!item.minRole || isExecutive) return true;
      const userLevel = ROLE_LEVEL[effectiveRole || "staff"] ?? 0;
      return userLevel >= (ROLE_LEVEL[item.minRole] ?? 0);
    })
    .filter((item) => canViewPage(item.id));

  const showBDSection = showBD && visibleBdSubItems.length > 0;
  const showPricingSection = showPricing && visiblePricingSubItems.length > 0;
  const showOperationsSection = showOperations && visibleOperationsSubItems.length > 0;
  const showAccountingSection = showAccounting && visibleAcctSubItems.length > 0;
  const showHRItem = showHR && canViewPage("hr");
  const showActivityLog = isExecutive && canViewPage("activity-log");
  const showAdminUsers = isExecutive && canViewPage("admin-users");
  
  // Check if any section page is active
  const isBDActive = currentPage.startsWith("bd-");
  const isPricingActive = currentPage.startsWith("pricing-");
  const isOperationsActive = currentPage.startsWith("ops-");
  const isAcctActive = currentPage.startsWith("acct-");
  
  // Work section (without BD and Accounting, we'll render them separately)
  const workItems = [
    { id: "operations" as Page, label: "Operations", icon: Package },
    { id: "hr" as Page, label: "HR", icon: User },
  ];
  
  // Personal section
  const personalItems = [
    { id: "calendar" as Page, label: "Calendar", icon: Calendar },
    { id: "inbox" as Page, label: "Inbox", icon: Inbox },
    { id: "my-evouchers" as Page, label: "E-Vouchers", icon: FileText },
  ];
  

  const otherItems: { id: Page; label: string; icon: any }[] = [];

  const renderNavButton = (item: { id: Page; label: string; icon: any }, isSubItem = false) => {
    const Icon = item.icon;
    const isActive = currentPage === item.id;

    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
        style={{
          height: isSubItem ? "36px" : "40px",
          backgroundColor: isActive ? "var(--neuron-state-selected)" : "transparent",
          border: "1.5px solid transparent",
          color: isActive ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
          fontWeight: isActive ? 500 : 400,
          justifyContent: isCollapsed ? "center" : "flex-start",
          paddingLeft: isCollapsed ? "0" : isSubItem ? "28px" : "12px",
          paddingRight: isCollapsed ? "0" : "12px",
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
        title={isCollapsed ? item.label : undefined}
      >
        <Icon
          size={isSubItem ? 18 : 20}
          style={{
            color: isActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
            flexShrink: 0
          }}
        />
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.span
              key="label"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
              style={{ fontSize: "14px", lineHeight: "20px" }}
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  };

  const renderSectionHeader = (label: string) => (
    <div 
      className="px-3 py-2 pt-6"
      style={{ 
        fontSize: "11px",
        fontWeight: 600,
        color: "var(--neuron-ink-muted)",
        letterSpacing: "0.5px",
      }}
    >
      {isCollapsed ? (
        <div
          style={{
            width: "20px",
            height: "2px",
            backgroundColor: "var(--neuron-ink-muted)",
            margin: "0 auto",
            opacity: 0.3
          }}
        />
      ) : (
        <AnimatePresence initial={false}>
          <motion.span
            key="section-label"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            style={{ display: "block" }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col"
      style={{
        minWidth: 0,
        backgroundColor: "var(--neuron-bg-elevated)",
        borderRight: "1px solid var(--neuron-ui-border)",
        overflow: "hidden",
        // Desktop: sits in the CSS grid column, height fills the grid row
        // Mobile: fixed overlay drawer that slides in from the left
        ...(isDesktop
          ? { position: "relative", zIndex: 20, height: "100%" }
          : {
              position: "fixed",
              top: 0,
              left: 0,
              height: "100dvh",
              width: "272px",
              zIndex: 50,
              transform: isMobileOpen ? "translateX(0)" : "translateX(-280px)",
              transition: "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.28s",
              boxShadow: isMobileOpen ? "4px 0 32px rgba(0,0,0,0.18)" : "none",
            }),
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center gap-2 px-4 justify-between"
        style={{ height: "56px" }}
      >
        {/* Logo - Only show when expanded */}
        {!isCollapsed && (
          <NeuronLogo
            height={24}
            wordmarkClassName="fill-[#12332B] dark:fill-white"
            className="cursor-pointer"
            onClick={() => onNavigate("dashboard")}
          />
        )}
        
        {/* Mobile: X close button — Desktop: collapse toggle */}
        {!isDesktop ? (
          <button
            onClick={onMobileClose}
            className="flex items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
            style={{
              width: "32px",
              height: "32px",
              color: "var(--neuron-ink-muted)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <X size={20} />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
            style={{
              width: "32px",
              height: "32px",
              color: "var(--neuron-ink-muted)",
              flexShrink: 0,
              marginLeft: isCollapsed ? "auto" : "0",
              marginRight: isCollapsed ? "auto" : "0",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <AnimatePresence initial={false} mode="wait">
              {isCollapsed ? (
                <motion.span
                  key="right"
                  initial={{ opacity: 0, rotate: -45 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 45 }}
                  transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
                  style={{ display: "flex" }}
                >
                  <ChevronRight size={20} />
                </motion.span>
              ) : (
                <motion.span
                  key="left"
                  initial={{ opacity: 0, rotate: 45 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -45 }}
                  transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
                  style={{ display: "flex" }}
                >
                  <ChevronLeft size={20} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="relative flex-1 min-h-0">
        <nav
          ref={navRef}
          onScroll={handleNavScroll}
          className="scrollbar-hide h-full overflow-y-auto px-4 pt-6 pb-4 space-y-1"
        >
        {/* Dashboard */}
        {renderNavButton(dashboardItem)}
        
        {/* Work Section */}
        {renderSectionHeader("WORK")}
        
        {/* Business Development with sub-items */}
        {showBDSection && (
          <div style={{ marginBottom: isBDExpanded ? "8px" : "0px" }}>
            <button
              onClick={() => {
                if (isCollapsed) {
                  const firstVisibleBdItem = visibleBdSubItems[0];
                  if (firstVisibleBdItem) onNavigate(firstVisibleBdItem.id);
                } else {
                  setIsBDExpanded(!isBDExpanded);
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
              style={{
                height: "40px",
                backgroundColor: isBDActive && !isBDExpanded ? "var(--neuron-state-selected)" : "transparent",
                border: "1.5px solid transparent",
                color: isBDActive ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                fontWeight: isBDActive ? 500 : 400,
                justifyContent: "space-between",
                paddingLeft: isCollapsed ? "0" : "12px",
                paddingRight: isCollapsed ? "0" : "12px",
              }}
              onMouseEnter={(e) => {
                if (!(isBDActive && !isBDExpanded)) {
                  e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                }
                prefetchBD();
              }}
              onMouseLeave={(e) => {
                if (!(isBDActive && !isBDExpanded)) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
              title={isCollapsed ? "Business Development" : undefined}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0" style={{ justifyContent: isCollapsed ? "center" : "flex-start" }}>
                <Briefcase
                  size={20}
                  style={{
                    color: isBDActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                    flexShrink: 0
                  }}
                />
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.span
                      key="bd-label"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                      style={{ fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap" }}
                    >
                      Business Development
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.span
                    key="bd-chevron"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    style={{ display: "flex", flexShrink: 0 }}
                  >
                    <ChevronDown
                      size={16}
                      style={{
                        color: "var(--neuron-ink-muted)",
                        transform: isBDExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.2s ease-out",
                      }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            
            {/* BD Sub-items */}
            <div 
              style={{
                maxHeight: isBDExpanded ? "360px" : "0px",
                opacity: isBDExpanded ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.3s ease-in-out, opacity 0.25s ease-in-out",
              }}
            >
              <div className="space-y-1 mt-1">
                {visibleBdSubItems.map(item => renderNavButton(item, true))}
              </div>
            </div>
          </div>
        )}
        
        {/* Pricing with sub-items */}
        {showPricingSection && (
          <div style={{ marginBottom: isPricingExpanded ? "8px" : "0px" }}>
            <button
              onClick={() => {
                if (isCollapsed) {
                  const firstVisiblePricingItem = visiblePricingSubItems[0];
                  if (firstVisiblePricingItem) onNavigate(firstVisiblePricingItem.id);
                } else {
                  setIsPricingExpanded(!isPricingExpanded);
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
              style={{
                height: "40px",
                backgroundColor: isPricingActive && !isPricingExpanded ? "var(--neuron-state-selected)" : "transparent",
                border: "1.5px solid transparent",
                color: isPricingActive ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                fontWeight: isPricingActive ? 500 : 400,
                justifyContent: "space-between",
                paddingLeft: isCollapsed ? "0" : "12px",
                paddingRight: isCollapsed ? "0" : "12px",
              }}
              onMouseEnter={(e) => {
                if (!(isPricingActive && !isPricingExpanded)) {
                  e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                }
                prefetchPricing();
              }}
              onMouseLeave={(e) => {
                if (!(isPricingActive && !isPricingExpanded)) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
              title={isCollapsed ? "Pricing" : undefined}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0" style={{ justifyContent: isCollapsed ? "center" : "flex-start" }}>
                <Banknote
                  size={20}
                  style={{
                    color: isPricingActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                    flexShrink: 0
                  }}
                />
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.span
                      key="pricing-label"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                      style={{ fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap" }}
                    >
                      Pricing
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.span
                    key="pricing-chevron"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    style={{ display: "flex", flexShrink: 0 }}
                  >
                    <ChevronDown
                      size={16}
                      style={{
                        color: "var(--neuron-ink-muted)",
                        transform: isPricingExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.2s ease-out",
                      }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            
            {/* Pricing Sub-items */}
            <div 
              style={{
                maxHeight: isPricingExpanded ? "280px" : "0px",
                opacity: isPricingExpanded ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.3s ease-in-out, opacity 0.25s ease-in-out",
              }}
            >
              <div className="space-y-1 mt-1">
                {visiblePricingSubItems.map(item => renderNavButton(item, true))}
              </div>
            </div>
          </div>
        )}
        
        {/* Operations with sub-items */}
        {showOperationsSection && (
          <div style={{ marginBottom: isOperationsExpanded ? "8px" : "0px" }}>
            <button
              onClick={() => {
                if (isCollapsed) {
                  const firstVisibleOperationsItem = visibleOperationsSubItems[0];
                  if (firstVisibleOperationsItem) onNavigate(firstVisibleOperationsItem.id);
                } else {
                  setIsOperationsExpanded(!isOperationsExpanded);
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
              style={{
                height: "40px",
                backgroundColor: isOperationsActive && !isOperationsExpanded ? "var(--neuron-state-selected)" : "transparent",
                border: "1.5px solid transparent",
                color: isOperationsActive ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                fontWeight: isOperationsActive ? 500 : 400,
                justifyContent: "space-between",
                paddingLeft: isCollapsed ? "0" : "12px",
                paddingRight: isCollapsed ? "0" : "12px",
              }}
              onMouseEnter={(e) => {
                if (!(isOperationsActive && !isOperationsExpanded)) {
                  e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                }
                prefetchOperations();
              }}
              onMouseLeave={(e) => {
                if (!(isOperationsActive && !isOperationsExpanded)) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
              title={isCollapsed ? "Operations" : undefined}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0" style={{ justifyContent: isCollapsed ? "center" : "flex-start" }}>
                <Package
                  size={20}
                  style={{
                    color: isOperationsActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                    flexShrink: 0
                  }}
                />
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.span
                      key="ops-label"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                      style={{ fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap" }}
                    >
                      Operations
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.span
                    key="ops-chevron"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    style={{ display: "flex", flexShrink: 0 }}
                  >
                    <ChevronDown
                      size={16}
                      style={{
                        color: "var(--neuron-ink-muted)",
                        transform: isOperationsExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.2s ease-out",
                      }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            
            {/* Operations Sub-items */}
            <div 
              style={{
                maxHeight: isOperationsExpanded ? "280px" : "0px",
                opacity: isOperationsExpanded ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.3s ease-in-out, opacity 0.25s ease-in-out",
              }}
            >
              <div className="space-y-1 mt-1">
                {visibleOperationsSubItems.map(item => renderNavButton(item, true))}
              </div>
            </div>
          </div>
        )}
        
        {/* HR */}
        <div className="space-y-1">
          {showHRItem && renderNavButton({ id: "hr" as Page, label: "HR", icon: User })}
        </div>

        {/* Accounting with sub-items */}
        {showAccountingSection && (
          <div style={{ marginBottom: isAcctExpanded ? "8px" : "0px" }}>
            <button
              onClick={() => {
                if (isCollapsed) {
                  const firstVisibleAccountingItem = visibleAcctSubItems[0];
                  if (firstVisibleAccountingItem) onNavigate(firstVisibleAccountingItem.id);
                } else {
                  setIsAcctExpanded(!isAcctExpanded);
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
              style={{
                height: "40px",
                backgroundColor: isAcctActive && !isAcctExpanded ? "var(--neuron-state-selected)" : "transparent",
                border: "1.5px solid transparent",
                color: isAcctActive ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                fontWeight: isAcctActive ? 500 : 400,
                justifyContent: "space-between",
                paddingLeft: isCollapsed ? "0" : "12px",
                paddingRight: isCollapsed ? "0" : "12px",
              }}
              onMouseEnter={(e) => {
                if (!(isAcctActive && !isAcctExpanded)) {
                  e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                }
                prefetchAccounting();
              }}
              onMouseLeave={(e) => {
                if (!(isAcctActive && !isAcctExpanded)) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
              title={isCollapsed ? "Accounting" : undefined}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0" style={{ justifyContent: isCollapsed ? "center" : "flex-start" }}>
                <PesoIcon
                  size={20}
                  style={{
                    color: isAcctActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                    flexShrink: 0
                  }}
                />
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.span
                      key="acct-label"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                      style={{ fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap" }}
                    >
                      Accounting
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.span
                    key="acct-chevron"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    style={{ display: "flex", flexShrink: 0 }}
                  >
                    <ChevronDown
                      size={16}
                      style={{
                        color: "var(--neuron-ink-muted)",
                        transform: isAcctExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.2s ease-out",
                      }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            
            {/* Accounting Sub-items */}
            <div 
              style={{
                maxHeight: isAcctExpanded ? "600px" : "0px",
                opacity: isAcctExpanded ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.3s ease-in-out, opacity 0.25s ease-in-out",
              }}
            >
              <div className="space-y-1 mt-1">
                {visibleAcctSubItems.map(item => renderNavButton(item, true))}
              </div>
            </div>
          </div>
        )}
        
        {/* Personal Section */}
        {renderSectionHeader("PERSONAL")}
        {personalItems.map(item => {
          if (item.id === "inbox") {
            const isActive = currentPage === "inbox";
            return (
              <button
                key="inbox"
                onClick={() => onNavigate("inbox")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
                style={{
                  position: "relative",
                  height: "40px",
                  backgroundColor: isActive ? "var(--neuron-state-selected)" : "transparent",
                  border: "1.5px solid transparent",
                  color: isActive ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                  fontWeight: isActive ? 500 : 400,
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  paddingLeft: isCollapsed ? "0" : "12px",
                  paddingRight: isCollapsed ? "0" : "12px",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                  prefetchInbox();
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                }}
                title={isCollapsed ? "Inbox" : undefined}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Inbox
                    size={20}
                    style={{ color: isActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)" }}
                  />
                  {inboxUnreadCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -5,
                        minWidth: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: "var(--theme-status-danger-fg)",
                        color: "#FFFFFF",
                        fontSize: 9,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 3px",
                        lineHeight: 1,
                      }}
                    >
                      {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
                    </span>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.span
                      key="inbox-label"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                      style={{ fontSize: "14px", lineHeight: "20px", flex: 1, textAlign: "left" }}
                    >
                      Inbox
                    </motion.span>
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false}>
                  {!isCollapsed && inboxUnreadCount > 0 && (
                    <motion.span
                      key="inbox-badge"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 10,
                        backgroundColor: "var(--theme-status-danger-bg)",
                        color: "var(--theme-status-danger-fg)",
                        marginLeft: "auto",
                        flexShrink: 0,
                      }}
                    >
                      {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          }
          return renderNavButton(item);
        })}

        {otherItems.map(item => renderNavButton(item))}

        {/* Executive Section */}
        {(showActivityLog || showAdminUsers) && (
          <>
            {renderSectionHeader("EXECUTIVE")}
            {showActivityLog && renderNavButton({ id: "activity-log" as Page, label: "Activity Log", icon: Activity })}
            {showAdminUsers && (() => {
              const isActive = currentPage === "admin-users";
              return (
                <button
                  onClick={() => onNavigate("admin-users")}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
                  style={{
                    position: "relative",
                    height: "40px",
                    backgroundColor: isActive ? "var(--neuron-state-selected)" : "transparent",
                    border: "1.5px solid transparent",
                    color: isActive ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                    fontWeight: isActive ? 500 : 400,
                    justifyContent: isCollapsed ? "center" : "flex-start",
                    paddingLeft: isCollapsed ? "0" : "12px",
                    paddingRight: isCollapsed ? "0" : "12px",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                  title={isCollapsed ? "Users" : undefined}
                >
                  <Users
                    size={20}
                    style={{ color: isActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)", flexShrink: 0 }}
                  />
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.span
                        key="users-label"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                        style={{ fontSize: "14px", lineHeight: "20px" }}
                      >
                        Users
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })()}
          </>
        )}
        </nav>

        {showTopScrollFade && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-0 left-4 h-8"
            style={{
              background: "linear-gradient(to top, transparent, var(--neuron-bg-elevated) 88%)",
            }}
          />
        )}

        {showBottomScrollFade && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-4 bottom-0 left-4 h-12"
            style={{
              background: "linear-gradient(to bottom, transparent, var(--neuron-bg-elevated) 78%)",
            }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
        {/* User Profile */}
        {currentUser && currentUser.name && (
          <button
            onClick={() => onNavigate("settings")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neuron-ui-active-border)]"
            style={{
              backgroundColor: currentPage === "settings" ? "var(--neuron-state-selected)" : "var(--theme-bg-surface-subtle)",
              border: "1.5px solid transparent",
              minHeight: "48px",
              justifyContent: isCollapsed ? "center" : "flex-start",
              paddingLeft: isCollapsed ? "0" : "12px",
              paddingRight: isCollapsed ? "0" : "12px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (currentPage !== "settings") {
                e.currentTarget.style.backgroundColor = "var(--neuron-state-selected)";
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage !== "settings") {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
              }
            }}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: "32px",
                height: "32px",
                backgroundColor: currentUser.avatar_url ? "transparent" : "var(--neuron-brand-green-100)",
                color: "var(--neuron-brand-green)",
                fontSize: "14px",
                fontWeight: 600,
                flexShrink: 0,
                overflow: "hidden",
              }}
              title={isCollapsed ? currentUser.name : undefined}
            >
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                currentUser.name.charAt(0).toUpperCase()
              )}
            </div>
            <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                key="profile-info"
                className="flex-1 min-w-0"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
              >
                <div 
                  className="truncate"
                  style={{ 
                    fontSize: "13px", 
                    fontWeight: 600, 
                    color: "var(--neuron-ink-primary)",
                    lineHeight: "18px",
                    textAlign: "left"
                  }}
                >
                  {currentUser.name}
                </div>
                <div 
                  className="truncate"
                  style={{ 
                    fontSize: "11px", 
                    color: "var(--neuron-ink-muted)",
                    lineHeight: "14px",
                    textAlign: "left"
                  }}
                >
                  {currentUser.email}
                </div>
                <div 
                  className="truncate"
                  style={{ 
                    fontSize: "11px", 
                    color: "var(--neuron-ink-muted)",
                    lineHeight: "14px",
                    textAlign: "left"
                  }}
                >
                  {currentUser.department}
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </button>
        )}
      </div>
    </div>
  );
}
