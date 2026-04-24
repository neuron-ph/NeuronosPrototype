// App entrypoint — Neuron OS
// Force recompilation: cache-bust 2026-03-12b
import { useState, useEffect, Suspense, lazy } from "react";
import { supabase } from "./utils/supabase/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams, Outlet } from "react-router";
import { Layout } from "./components/Layout";
import { UserProvider, useUser } from "./hooks/useUser";
import { PermissionProvider } from "./context/PermissionProvider";
import { RouteGuard } from "./components/RouteGuard";
import type { ActionId, ModuleId } from "./components/admin/permissionsConfig";
import { toast } from "sonner@2.0.3";
import { Toaster } from "./components/ui/sonner";
import type { Customer } from "./types/bd";
import { RouteTracker } from "./components/RouteTracker";
import { NeuronLogo } from "./components/NeuronLogo";
import { useWorkspaceTheme } from "./theme/useWorkspaceTheme";
import { getThemeModePreference, setThemeModePreference } from "./theme/themeMode";
import { resolveThemeMode } from "./theme/themeBootstrap";
import { Moon, Sun } from "lucide-react";
import { useReferenceDataPrefetch } from "./hooks/useReferenceDataPrefetch";
import { BetaWelcomeScreen } from "./components/onboarding/BetaWelcomeScreen";
import { FeedbackButton } from "./components/feedback/FeedbackButton";
import { FeedbackPositionProvider } from "./contexts/FeedbackPositionContext";
import posthog from "posthog-js";

const MyHomepage = lazy(() => import("./components/MyHomepage").then((module) => ({ default: module.MyHomepage })));
const BusinessDevelopment = lazy(() => import("./components/BusinessDevelopment").then((module) => ({ default: module.BusinessDevelopment })));
const Pricing = lazy(() => import("./components/Pricing").then((module) => ({ default: module.Pricing })));
const Operations = lazy(() => import("./components/Operations").then((module) => ({ default: module.Operations })));
const ProjectsModule = lazy(() => import("./components/projects/ProjectsModule").then((module) => ({ default: module.ProjectsModule })));
const ContractsModule = lazy(() => import("./components/contracts/ContractsModule").then((module) => ({ default: module.ContractsModule })));
const FinancialsModule = lazy(() => import("./components/accounting/FinancialsModule").then((module) => ({ default: module.FinancialsModule })));
const CatalogManagementPage = lazy(() => import("./components/accounting/CatalogManagementPage").then((module) => ({ default: module.CatalogManagementPage })));
const AccountingBookingsShell = lazy(() => import("./components/accounting/AccountingBookingsShell").then((module) => ({ default: module.AccountingBookingsShell })));
const AccountingCustomers = lazy(() => import("./components/accounting/AccountingCustomers").then((module) => ({ default: module.AccountingCustomers })));
const ReportsModule = lazy(() => import("./components/accounting/reports/ReportsModule").then((module) => ({ default: module.ReportsModule })));
const FinancialStatementsPage = lazy(() => import("./components/accounting/FinancialStatementsPage").then((module) => ({ default: module.FinancialStatementsPage })));
const EVouchersContent = lazy(() => import("./components/accounting/EVouchersContent").then((module) => ({ default: module.EVouchersContent })));
const ChartOfAccounts = lazy(() => import("./components/accounting/coa/ChartOfAccounts").then((module) => ({ default: module.ChartOfAccounts })));
const GeneralJournal = lazy(() => import("./components/accounting/journal/GeneralJournal").then((module) => ({ default: module.GeneralJournal })));
const HR = lazy(() => import("./components/HR").then((module) => ({ default: module.HR })));
const InboxPage = lazy(() => import("./components/InboxPage").then((module) => ({ default: module.InboxPage })));
const MyEVouchersPage = lazy(() => import("./components/MyEVouchersPage").then((module) => ({ default: module.MyEVouchersPage })));
const DisburseEVoucherPage = lazy(() => import("./components/accounting/evouchers/DisburseEVoucherPage").then((module) => ({ default: module.DisburseEVoucherPage })));
const ActivityLogPage = lazy(() => import("./components/ActivityLogPage").then((module) => ({ default: module.ActivityLogPage })));
const EmployeeProfile = lazy(() => import("./components/EmployeeProfile").then((module) => ({ default: module.EmployeeProfile })));
const CreateBooking = lazy(() => import("./components/operations/CreateBooking").then((module) => ({ default: module.CreateBooking })));
const BookingFullView = lazy(() => import("./components/operations/BookingFullView").then((module) => ({ default: module.BookingFullView })));
const TruckingBookings = lazy(() => import("./components/operations/TruckingBookings").then((module) => ({ default: module.TruckingBookings })));
const BrokerageBookings = lazy(() => import("./components/operations/BrokerageBookings").then((module) => ({ default: module.BrokerageBookings })));
const MarineInsuranceBookings = lazy(() => import("./components/operations/MarineInsuranceBookings").then((module) => ({ default: module.MarineInsuranceBookings })));
const OthersBookings = lazy(() => import("./components/operations/OthersBookings").then((module) => ({ default: module.OthersBookings })));
const DiagnosticsPage = lazy(() => import("./components/DiagnosticsPage").then((module) => ({ default: module.DiagnosticsPage })));
const SupabaseDebug = lazy(() => import("./components/SupabaseDebug").then((module) => ({ default: module.SupabaseDebug })));
const DesignSystemGuide = lazy(() => import("./components/DesignSystemGuide").then((module) => ({ default: module.DesignSystemGuide })));
const Settings = lazy(() => import("./components/settings/Settings").then((m) => ({ default: m.Settings })));
const UserManagement = lazy(() => import("./components/admin/UserManagement").then((m) => ({ default: m.UserManagement })));
const UserDetailPage = lazy(() => import("./components/admin/UserDetailPage").then((m) => ({ default: m.UserDetailPage })));
const CreateUserPage = lazy(() => import("./components/admin/CreateUserPage").then((m) => ({ default: m.CreateUserPage })));
const CalendarModule = lazy(() => import("./components/calendar/CalendarModule").then((m) => ({ default: m.CalendarModule })));

function RouteLoadingState() {
  return (
    <div className="min-h-screen w-full bg-[rgb(255,255,255)] flex items-center justify-center">
      <div className="text-center">
        <p style={{ color: "var(--neuron-ink-muted)" }}>Loading...</p>
      </div>
    </div>
  );
}

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("user not found") || msg.includes("no user found")) {
    return "No account found with that email address.";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  if (msg.includes("database") || msg.includes("schema") || msg.includes("unexpected")) {
    return "Something went wrong on our end. Please try again in a moment.";
  }
  return "Sign-in failed. Please check your credentials and try again.";
}

function LoginPage() {
  const { login } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDark, setIsDark] = useState(() =>
    resolveThemeMode(getThemeModePreference()) === "dark"
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await login(email, password);

    if (!result.success) {
      setError(friendlyAuthError(result.error || "Login failed"));
    } else {
      toast.success('Welcome to Neuron OS!');
    }

    setIsLoading(false);
  };

  const toggleTheme = () => {
    const next = isDark ? "light" : "dark";
    setThemeModePreference(next);
    setIsDark(!isDark);
  };

  const isLoginDisabled = !email || !password || isLoading;

  return (
    <div className="min-h-screen w-full bg-[var(--theme-bg-page)] flex items-center justify-center p-6 relative">
      {/* Dark mode toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 p-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
        aria-label="Toggle dark mode"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Login Card */}
      <div className="w-full max-w-[420px] bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-2xl px-12 py-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <NeuronLogo height={36} />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--theme-status-danger-bg)] border border-[var(--theme-status-danger-border)]">
            <p className="text-sm text-[var(--theme-status-danger-fg)]">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-[var(--theme-text-primary)] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--theme-border-default)] bg-[var(--theme-input-subtle-bg)] text-[var(--theme-text-primary)] font-['Inter:Regular',sans-serif] placeholder:text-[var(--theme-text-muted)] focus:outline-none focus:border-[var(--theme-border-strong)] transition-all"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-[var(--theme-text-primary)] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--theme-border-default)] bg-[var(--theme-input-subtle-bg)] text-[var(--theme-text-primary)] font-['Inter:Regular',sans-serif] placeholder:text-[var(--theme-text-muted)] focus:outline-none focus:border-[var(--theme-border-strong)] transition-all"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoginDisabled}
            className="w-full py-2.5 px-4 bg-[#6b9d94] text-white rounded-lg font-['Inter:Medium',sans-serif] font-medium hover:bg-[#5a8a82] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 transition-all duration-150 mt-6 text-center"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[var(--theme-text-muted)] text-xs">
            Powered by Supabase Auth
          </p>
          <p className="text-[var(--theme-text-muted)] text-sm mt-1">
            &copy; 2025 Neuron. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper component to convert route path to Page type for Layout
function RouteWrapper({ children, page }: { children: React.ReactNode; page: string }) {
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  // Map current URL to Page type for Layout's active state
  const getCurrentPage = (): string => {
    const path = location.pathname;
    if (path === "/" || path === "/dashboard") return "dashboard";
    if (path.startsWith("/bd/projects")) return "bd-projects";
    if (path.startsWith("/bd/contracts")) return "bd-contracts";
    if (path.startsWith("/bd/contacts")) return "bd-contacts";
    if (path.startsWith("/bd/customers")) return "bd-customers";
    if (path.startsWith("/bd/inquiries")) return "bd-inquiries";
    if (path.startsWith("/bd/tasks")) return "bd-tasks";
    if (path.startsWith("/bd/activities")) return "bd-activities";
    if (path.startsWith("/bd/budget-requests")) return "bd-budget-requests";
    if (path.startsWith("/pricing/contacts")) return "pricing-contacts";
    if (path.startsWith("/pricing/customers")) return "pricing-customers";
    if (path.startsWith("/pricing/quotations")) return "pricing-quotations";
    if (path.startsWith("/pricing/projects")) return "pricing-projects";
    if (path.startsWith("/pricing/contracts")) return "pricing-contracts";
    if (path.startsWith("/pricing/vendors")) return "pricing-vendors";
    if (path.startsWith("/operations/forwarding")) return "ops-forwarding";
    if (path.startsWith("/operations/brokerage")) return "ops-brokerage";
    if (path.startsWith("/operations/trucking")) return "ops-trucking";
    if (path.startsWith("/operations/marine-insurance")) return "ops-marine-insurance";
    if (path.startsWith("/operations/others")) return "ops-others";
    if (path.startsWith("/operations")) return "operations";
    if (path.startsWith("/projects")) return "projects";
    if (path.startsWith("/contracts")) return "contracts";
    if (path.startsWith("/accounting/journal")) return "acct-journal";
    if (path.startsWith("/accounting/coa")) return "acct-coa";
    if (path.startsWith("/accounting/evouchers")) return "acct-evouchers";
    if (path.startsWith("/accounting/financials")) return "acct-financials";
    if (path.startsWith("/accounting/invoices")) return "acct-invoices";
    if (path.startsWith("/accounting/billings")) return "acct-billings";
    if (path.startsWith("/accounting/collections")) return "acct-collections";
    if (path.startsWith("/accounting/expenses")) return "acct-expenses";
    if (path.startsWith("/accounting/ledger")) return "acct-ledger";
    if (path.startsWith("/accounting/projects")) return "acct-projects";
    if (path.startsWith("/accounting/contracts")) return "acct-contracts";
    if (path.startsWith("/accounting/customers")) return "acct-customers";
    if (path.startsWith("/accounting/bookings")) return "acct-bookings";
    if (path.startsWith("/accounting/statements")) return "acct-statements";
    if (path.startsWith("/accounting/reports")) return "acct-reports";
    if (path.startsWith("/accounting/catalog")) return "acct-catalog";
    if (path.startsWith("/hr")) return "hr";
    if (path.startsWith("/calendar")) return "calendar";
    if (path.startsWith("/my-evouchers")) return "my-evouchers";
    if (path.startsWith("/inbox")) return "inbox";
    if (path.startsWith("/activity-log")) return "activity-log";
    if (path.startsWith("/settings")) return "settings";
    if (path.startsWith("/admin/users")) return "admin-users";
    if (path.startsWith("/design-system")) return "design-system";
    return "dashboard";
  };

  // Handler to navigate using router
  const handleNavigate = (page: string) => {
    const routeMap: Record<string, string> = {
      "dashboard": "/dashboard",
      "bd-contacts": "/bd/contacts",
      "bd-customers": "/bd/customers",
      "bd-inquiries": "/bd/inquiries",
      "projects": "/projects",
      "contracts": "/contracts",
      "bd-projects": "/bd/projects",
      "bd-contracts": "/bd/contracts",
      "bd-tasks": "/bd/tasks",
      "bd-activities": "/bd/activities",
      "bd-budget-requests": "/bd/budget-requests",
      "pricing-contacts": "/pricing/contacts",
      "pricing-customers": "/pricing/customers",
      "pricing-quotations": "/pricing/quotations",
      "pricing-projects": "/pricing/projects",
      "pricing-contracts": "/pricing/contracts",
      "pricing-vendors": "/pricing/vendors",
      "operations": "/operations",
      "ops-forwarding": "/operations/forwarding",
      "ops-brokerage": "/operations/brokerage",
      "ops-trucking": "/operations/trucking",
      "ops-marine-insurance": "/operations/marine-insurance",
      "ops-others": "/operations/others",
      "acct-journal": "/accounting/journal",
      "acct-coa": "/accounting/coa",
      "acct-evouchers": "/accounting/evouchers",
      "acct-financials": "/accounting/financials",
      "acct-invoices": "/accounting/invoices",
      "acct-billings": "/accounting/billings",
      "acct-collections": "/accounting/collections",
      "acct-expenses": "/accounting/expenses",
      "acct-ledger": "/accounting/ledger",
      "acct-projects": "/accounting/projects",
      "acct-contracts": "/accounting/contracts",
      "acct-customers": "/accounting/customers",
      "acct-bookings": "/accounting/bookings",
      "acct-statements": "/accounting/statements",
      "acct-reports": "/accounting/reports",
      "acct-catalog": "/accounting/catalog",
      "hr": "/hr",
      "calendar": "/calendar",
      "inbox": "/inbox",
      "my-evouchers": "/my-evouchers",
      "activity-log": "/activity-log",
      "settings": "/settings",
      "admin-users": "/admin/users",
      "design-system": "/design-system"
    };
    
    const route = routeMap[page] || "/dashboard";
    navigate(route);
  };

  return (
    <Layout 
      currentPage={getCurrentPage() as any}
      onNavigate={handleNavigate as any}
      currentUser={user || undefined}
      onLogout={logout}
    >
      {children}
    </Layout>
  );
}

// Business Development Routes
function BDContactsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { contactId } = useParams();
  
  const handleCreateInquiry = (customer: Customer) => {
    navigate(`/bd/inquiries?customerId=${customer.id}`);
  };
  
  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/bd/inquiries/${inquiryId}`);
  };
  
  return (
    <RouteWrapper page="bd-contacts">
      <BusinessDevelopment 
        view="contacts" 
        onCreateInquiry={handleCreateInquiry}
        onViewInquiry={handleViewInquiry}
        currentUser={user}
        contactId={contactId}
      />
    </RouteWrapper>
  );
}

function BDCustomersPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleCreateInquiry = (customer: Customer) => {
    navigate(`/bd/inquiries?customerId=${customer.id}`);
  };
  
  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/bd/inquiries/${inquiryId}`);
  };
  
  return (
    <RouteWrapper page="bd-customers">
      <BusinessDevelopment 
        view="customers" 
        onCreateInquiry={handleCreateInquiry}
        onViewInquiry={handleViewInquiry}
        currentUser={user}
      />
    </RouteWrapper>
  );
}

function BDInquiriesPage() {
  const { user } = useUser();
  const { inquiryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const customerId = searchParams.get('customerId');

  // TODO: Fetch customer data if customerId is provided
  const customerData = null;

  const handleCreateTicket = (quotation: any) => {
    navigate('/inbox', quotation?.id ? { state: { compose: { entity_type: 'quotation', entity_id: quotation.id, entity_label: quotation.quotationNumber || quotation.id } } } : undefined);
  };

  return (
    <RouteWrapper page="bd-inquiries">
      <BusinessDevelopment
        view="inquiries"
        customerData={customerData}
        inquiryId={inquiryId}
        currentUser={user}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

function BDTasksPage() {
  const { user } = useUser();
  return (
    <RouteWrapper page="bd-tasks">
      <BusinessDevelopment view="tasks" currentUser={user} />
    </RouteWrapper>
  );
}

function BDProjectsPage() {
  const { user } = useUser();
  return (
    <RouteWrapper page="bd-projects">
      <BusinessDevelopment view="projects" currentUser={user} />
    </RouteWrapper>
  );
}

function BDContractsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleCreateTicket = (entity: { type: string; id: string; name: string }) => {
    navigate('/inbox', { state: { compose: { entity_type: entity.type, entity_id: entity.id, entity_label: entity.name } } });
  };

  return (
    <RouteWrapper page="bd-contracts">
      <ContractsModule 
        currentUser={user || undefined}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

function BDActivitiesPage() {
  const { user } = useUser();
  return (
    <RouteWrapper page="bd-activities">
      <BusinessDevelopment view="activities" currentUser={user} />
    </RouteWrapper>
  );
}

function BDBudgetRequestsPage() {
  return (
    <RouteWrapper page="bd-budget-requests">
      <BusinessDevelopment view="budget-requests" />
    </RouteWrapper>
  );
}

// Unified Projects Page (Bridge Module for BD and Operations)
function ProjectsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleCreateTicket = (entity: { type: string; id: string; name: string }) => {
    navigate('/inbox', { state: { compose: { entity_type: entity.type, entity_id: entity.id, entity_label: entity.name } } });
  };

  return (
    <RouteWrapper page="projects">
      <ProjectsModule 
        currentUser={user || undefined}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

// Unified Contracts Page (Bridge Module for BD and Operations)
function ContractsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleCreateTicket = (entity: { type: string; id: string; name: string }) => {
    navigate('/inbox', { state: { compose: { entity_type: entity.type, entity_id: entity.id, entity_label: entity.name } } });
  };

  return (
    <RouteWrapper page="contracts">
      <ContractsModule 
        currentUser={user || undefined}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

// Pricing Routes
function PricingContactsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/pricing/quotations/${inquiryId}`);
  };
  
  return (
    <RouteWrapper page="pricing-contacts">
      <Pricing 
        view="contacts" 
        onViewInquiry={handleViewInquiry}
        currentUser={user}
      />
    </RouteWrapper>
  );
}

function PricingCustomersPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleViewInquiry = (inquiryId: string) => {
    navigate(`/pricing/quotations/${inquiryId}`);
  };
  
  return (
    <RouteWrapper page="pricing-customers">
      <Pricing 
        view="customers" 
        onViewInquiry={handleViewInquiry}
        currentUser={user}
      />
    </RouteWrapper>
  );
}

function PricingQuotationsPage() {
  const { user } = useUser();
  const { inquiryId } = useParams();
  const navigate = useNavigate();

  const handleCreateTicket = (quotation: any) => {
    navigate('/inbox', quotation?.id ? { state: { compose: { entity_type: 'quotation', entity_id: quotation.id, entity_label: quotation.quotationNumber || quotation.id } } } : undefined);
  };

  return (
    <RouteWrapper page="pricing-quotations">
      <Pricing
        view="quotations"
        inquiryId={inquiryId}
        currentUser={user}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

function PricingProjectsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleCreateTicket = (entity: { type: string; id: string; name: string }) => {
    navigate('/inbox', { state: { compose: { entity_type: entity.type, entity_id: entity.id, entity_label: entity.name } } });
  };

  return (
    <RouteWrapper page="pricing-projects">
      <ProjectsModule 
        currentUser={user || undefined}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

function PricingContractsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleCreateTicket = (entity: { type: string; id: string; name: string }) => {
    navigate('/inbox', { state: { compose: { entity_type: entity.type, entity_id: entity.id, entity_label: entity.name } } });
  };

  return (
    <RouteWrapper page="pricing-contracts">
      <ContractsModule 
        currentUser={user || undefined}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

function PricingVendorsPage() {
  const { user } = useUser();
  return (
    <RouteWrapper page="pricing-vendors">
      <Pricing view="vendors" currentUser={user} />
    </RouteWrapper>
  );
}

// Operations Routes
function OperationsPage() {
  const { user } = useUser();
  
  return (
    <RouteWrapper page="operations">
      <Operations 
        view="forwarding"
        currentUser={user}
      />
    </RouteWrapper>
  );
}

function OperationsProjectsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  
  const handleCreateTicket = (entity: { type: string; id: string; name: string }) => {
    navigate('/inbox', { state: { compose: { entity_type: entity.type, entity_id: entity.id, entity_label: entity.name } } });
  };

  return (
    <RouteWrapper page="ops-projects">
      <ProjectsModule 
        currentUser={user || undefined}
        onCreateTicket={handleCreateTicket}
      />
    </RouteWrapper>
  );
}

function ForwardingBookingsPage() {
  const { user } = useUser();

  return (
    <RouteWrapper page="ops-forwarding">
      <Operations
        view="forwarding"
        currentUser={user}
      />
    </RouteWrapper>
  );
}

function BrokerageBookingsPage() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const pendingBookingId = searchParams.get("booking");
  return (
    <RouteWrapper page="ops-brokerage">
      <BrokerageBookings currentUser={user} pendingBookingId={pendingBookingId} />
    </RouteWrapper>
  );
}

function TruckingBookingsPage() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const pendingBookingId = searchParams.get("booking");
  return (
    <RouteWrapper page="ops-trucking">
      <TruckingBookings currentUser={user} pendingBookingId={pendingBookingId} />
    </RouteWrapper>
  );
}

function MarineInsuranceBookingsPage() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const pendingBookingId = searchParams.get("booking");
  return (
    <RouteWrapper page="ops-marine-insurance">
      <MarineInsuranceBookings currentUser={user} pendingBookingId={pendingBookingId} />
    </RouteWrapper>
  );
}

function OthersBookingsPage() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const pendingBookingId = searchParams.get("booking");
  return (
    <RouteWrapper page="ops-others">
      <OthersBookings currentUser={user} pendingBookingId={pendingBookingId} />
    </RouteWrapper>
  );
}

function CreateBookingPage() {
  const navigate = useNavigate();
  
  const handleBookingBack = () => {
    navigate('/operations');
  };
  
  const handleBookingSubmit = (bookingData: any) => {
    console.log("Booking created:", bookingData);
    toast.success("Booking created successfully!");
    navigate('/operations');
  };
  
  return (
    <RouteWrapper page="operations">
      <CreateBooking onBack={handleBookingBack} onSubmit={handleBookingSubmit} />
    </RouteWrapper>
  );
}

function BookingDetailPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      navigate('/operations', { replace: true });
      return;
    }

    supabase
      .from('bookings')
      .select('service_type')
      .eq('id', bookingId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setNotFound(true);
          return;
        }
        const slugMap: Record<string, string> = {
          'Forwarding':       '/operations/forwarding',
          'Brokerage':        '/operations/brokerage',
          'Trucking':         '/operations/trucking',
          'Marine Insurance': '/operations/marine-insurance',
          'Others':           '/operations/others',
        };
        const slug = slugMap[data.service_type] ?? '/operations';
        navigate(`${slug}?booking=${bookingId}`, { replace: true });
      });
  }, [bookingId, navigate]);

  if (notFound) {
    return (
      <RouteWrapper page="operations">
        <div className="h-full flex items-center justify-center" style={{ background: "var(--neuron-bg-page)" }}>
          <div className="text-center">
            <h2 style={{ color: "var(--neuron-ink-primary)" }} className="mb-2">Booking Not Found</h2>
            <p style={{ color: "var(--neuron-ink-muted)" }}>Booking ID: {bookingId}</p>
            <button
              onClick={() => navigate('/operations')}
              style={{ marginTop: '16px', padding: '8px 16px', background: 'var(--neuron-brand-green)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              Back to Operations
            </button>
          </div>
        </div>
      </RouteWrapper>
    );
  }

  return (
    <RouteWrapper page="operations">
      <div className="h-full flex items-center justify-center" style={{ background: "var(--neuron-bg-page)" }}>
        <p style={{ color: "var(--neuron-ink-muted)" }}>Loading…</p>
      </div>
    </RouteWrapper>
  );
}

// Accounting Routes
function AccountingEVouchersPage() {
  return (
    <RouteWrapper page="acct-evouchers">
      <EVouchersContent />
    </RouteWrapper>
  );
}

function AccountingInvoicesPage() {
  return (
    <RouteWrapper page="acct-invoices">
      <FinancialsModule />
    </RouteWrapper>
  );
}

function AccountingBillingsPage() {
  return (
    <RouteWrapper page="acct-billings">
      <FinancialsModule />
    </RouteWrapper>
  );
}

function AccountingCollectionsPage() {
  return (
    <RouteWrapper page="acct-collections">
      <FinancialsModule />
    </RouteWrapper>
  );
}

function AccountingExpensesPage() {
  return (
    <RouteWrapper page="acct-expenses">
      <FinancialsModule />
    </RouteWrapper>
  );
}

function AccountingLedgerPage() {
  return (
    <RouteWrapper page="acct-ledger">
      <ChartOfAccounts />
    </RouteWrapper>
  );
}

function AccountingReportsPage() {
  return (
    <RouteWrapper page="acct-reports">
      <ReportsModule />
    </RouteWrapper>
  );
}

function AccountingStatementsPage() {
  return (
    <RouteWrapper page="acct-statements">
      <FinancialStatementsPage />
    </RouteWrapper>
  );
}

function AccountingCoaPage() {
  return (
    <RouteWrapper page="acct-coa">
      <ChartOfAccounts />
    </RouteWrapper>
  );
}

function AccountingJournalPage() {
  return (
    <RouteWrapper page="acct-journal">
      <GeneralJournal />
    </RouteWrapper>
  );
}

function AccountingProjectsPage() {
  return (
    <RouteWrapper page="acct-projects">
      <ProjectsModule />
    </RouteWrapper>
  );
}

function AccountingContractsPage() {
  return (
    <RouteWrapper page="acct-contracts">
      <ContractsModule />
    </RouteWrapper>
  );
}

function AccountingCustomersPage() {
  return (
    <RouteWrapper page="acct-customers">
      <AccountingCustomers />
    </RouteWrapper>
  );
}

function AccountingBookingsPage() {
  return (
    <RouteWrapper page="acct-bookings">
      <AccountingBookingsShell />
    </RouteWrapper>
  );
}

function AccountingCatalogPage() {
  return (
    <RouteWrapper page="acct-catalog">
      <CatalogManagementPage />
    </RouteWrapper>
  );
}

function AccountingFinancialsPage() {
  return (
    <RouteWrapper page="acct-financials">
      <FinancialsModule />
    </RouteWrapper>
  );
}

// Other Routes
function DashboardPage() {
  const { user } = useUser();
  return (
    <RouteWrapper page="dashboard">
      <MyHomepage currentUser={user} />
    </RouteWrapper>
  );
}

function HRPage() {
  const { effectiveRole } = useUser();
  return (
    <RouteWrapper page="hr">
      <HR userRole={(effectiveRole as 'staff' | 'team_leader' | 'manager') || 'staff'} />
    </RouteWrapper>
  );
}

function CalendarPage() {
  return (
    <RouteWrapper page="calendar">
      <CalendarModule />
    </RouteWrapper>
  );
}

function InboxPageWrapper() {
  return (
    <RouteWrapper page="inbox">
      <InboxPage />
    </RouteWrapper>
  );
}

function MyEVouchersPageWrapper() {
  return (
    <RouteWrapper page="my-evouchers">
      <MyEVouchersPage />
    </RouteWrapper>
  );
}

function ActivityLogPageWrapper() {
  return (
    <RouteWrapper page="activity-log">
      <ActivityLogPage />
    </RouteWrapper>
  );
}

function SettingsPage() {
  return (
    <RouteWrapper page="settings">
      <Settings />
    </RouteWrapper>
  );
}

function UserManagementPage() {
  return (
    <RouteWrapper page="admin-users">
      <UserManagement />
    </RouteWrapper>
  );
}

function UserDetailPageWrapper() {
  return (
    <RouteWrapper page="admin-users">
      <UserDetailPage />
    </RouteWrapper>
  );
}

function CreateUserPageWrapper() {
  return (
    <RouteWrapper page="admin-users">
      <CreateUserPage />
    </RouteWrapper>
  );
}

function DesignSystemPage() {
  return (
    <RouteWrapper page="design-system">
      <DesignSystemGuide />
    </RouteWrapper>
  );
}

// Layout route that enforces department, role, and explicit module permission guards on child routes
function GuardedLayout({
  allowedDepartments,
  requireMinRole,
  requiredPermission,
}: {
  allowedDepartments?: string[];
  requireMinRole?: "staff" | "team_leader" | "supervisor" | "manager" | "executive";
  requiredPermission?: { moduleId: ModuleId; action: ActionId };
}) {
  return (
    <RouteGuard
      allowedDepartments={allowedDepartments}
      requireMinRole={requireMinRole}
      requiredPermission={requiredPermission}
    >
      <Outlet />
    </RouteGuard>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, user } = useUser();
  useWorkspaceTheme();
  useReferenceDataPrefetch();

  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    const acked = localStorage.getItem(`neuron_beta_acked_${user.id}`);
    if (!acked) setShowWelcome(true);
  }, [user?.id]);

  // Show loading state while checking auth
  if (isLoading) {
    return <RouteLoadingState />;
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <FeedbackPositionProvider>
        <FeedbackButton />
        <Toaster />
        <Suspense fallback={<RouteLoadingState />}>
          <Routes>
            <Route path="/supabase-debug" element={<SupabaseDebug />} />
            <Route path="*" element={<LoginPage />} />
          </Routes>
        </Suspense>
      </FeedbackPositionProvider>
    );
  }

  return (
    <FeedbackPositionProvider>
    <FeedbackButton />
    <>
      <RouteTracker />
      {showWelcome && user && (
        <BetaWelcomeScreen userId={user.id} onDone={() => setShowWelcome(false)} />
      )}
      <Toaster />
      <Suspense fallback={<RouteLoadingState />}>
      <Routes>
        {/* Default route */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* Dashboard */}
        <Route path="/dashboard" element={<DashboardPage />} />
        
        {/* Business Development — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Business Development']} />}>
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "bd_contacts", action: "view" }} />}>
            <Route path="/bd/contacts" element={<BDContactsPage />} />
            <Route path="/bd/contacts/:contactId" element={<BDContactsPage />} />
          </Route>
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "bd_customers", action: "view" }} />}>
            <Route path="/bd/customers" element={<BDCustomersPage />} />
          </Route>
          <Route path="/bd/inquiries" element={<BDInquiriesPage />} />
          <Route path="/bd/inquiries/:inquiryId" element={<BDInquiriesPage />} />
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "bd_tasks", action: "view" }} />}>
            <Route path="/bd/tasks" element={<BDTasksPage />} />
          </Route>
          <Route path="/bd/projects" element={<BDProjectsPage />} />
          <Route path="/bd/contracts" element={<BDContractsPage />} />
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "bd_activities", action: "view" }} />}>
            <Route path="/bd/activities" element={<BDActivitiesPage />} />
          </Route>
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "bd_budget_requests", action: "view" }} />}>
            <Route path="/bd/budget-requests" element={<BDBudgetRequestsPage />} />
          </Route>
        </Route>
        
        {/* Unified Projects Page */}
        <Route path="/projects" element={<ProjectsPage />} />
        
        {/* Unified Contracts Page */}
        <Route path="/contracts" element={<ContractsPage />} />
        
        {/* Pricing — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Pricing']} />}>
          <Route path="/pricing/contacts" element={<PricingContactsPage />} />
          <Route path="/pricing/customers" element={<PricingCustomersPage />} />
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "pricing_quotations", action: "view" }} />}>
            <Route path="/pricing/quotations" element={<PricingQuotationsPage />} />
            <Route path="/pricing/quotations/:inquiryId" element={<PricingQuotationsPage />} />
          </Route>
          <Route path="/pricing/projects" element={<PricingProjectsPage />} />
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "pricing_contracts", action: "view" }} />}>
            <Route path="/pricing/contracts" element={<PricingContractsPage />} />
          </Route>
          <Route path="/pricing/vendors" element={<PricingVendorsPage />} />
        </Route>
        
        {/* Operations — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Operations']} />}>
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/operations/create" element={<CreateBookingPage />} />
          <Route path="/operations/:bookingId" element={<BookingDetailPage />} />
          <Route path="/operations/forwarding" element={<ForwardingBookingsPage />} />
          <Route path="/operations/trucking" element={<TruckingBookingsPage />} />
          <Route path="/operations/brokerage" element={<BrokerageBookingsPage />} />
          <Route path="/operations/marine-insurance" element={<MarineInsuranceBookingsPage />} />
          <Route path="/operations/others" element={<OthersBookingsPage />} />
        </Route>
        
        {/* Accounting — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Accounting']} />}>
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "acct_evouchers", action: "view" }} />}>
            <Route path="/accounting/evouchers" element={<AccountingEVouchersPage />} />
          </Route>
          <Route path="/accounting/invoices" element={<AccountingInvoicesPage />} />
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "acct_billings", action: "view" }} />}>
            <Route path="/accounting/billings" element={<AccountingBillingsPage />} />
          </Route>
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "acct_collections", action: "view" }} />}>
            <Route path="/accounting/collections" element={<AccountingCollectionsPage />} />
          </Route>
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "acct_expenses", action: "view" }} />}>
            <Route path="/accounting/expenses" element={<AccountingExpensesPage />} />
          </Route>
          <Route path="/accounting/coa" element={<AccountingCoaPage />} />
          <Route path="/accounting/ledger" element={<AccountingLedgerPage />} />
          <Route path="/accounting/projects" element={<AccountingProjectsPage />} />
          <Route path="/accounting/contracts" element={<AccountingContractsPage />} />
          <Route path="/accounting/customers" element={<AccountingCustomersPage />} />
          <Route path="/accounting/bookings" element={<AccountingBookingsPage />} />
          <Route element={<GuardedLayout requiredPermission={{ moduleId: "acct_reports", action: "view" }} />}>
            <Route path="/accounting/reports" element={<AccountingReportsPage />} />
          </Route>
          <Route path="/accounting/catalog" element={<AccountingCatalogPage />} />
        </Route>

        {/* General Journal + Financial Statements — Accounting + Executive */}
        <Route element={<GuardedLayout allowedDepartments={['Accounting', 'Executive']} />}>
          <Route path="/accounting/journal" element={<AccountingJournalPage />} />
          <Route path="/accounting/statements" element={<AccountingStatementsPage />} />
        </Route>

        {/* Finance Overview — Accounting Manager or Executive only */}
        <Route element={<GuardedLayout allowedDepartments={['Accounting']} requireMinRole="manager" />}>
          <Route path="/accounting/financials" element={<AccountingFinancialsPage />} />
        </Route>
        
        {/* HR — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['HR']} requiredPermission={{ moduleId: "hr", action: "view" }} />}>
          <Route path="/hr" element={<HRPage />} />
        </Route>

        {/* Manager+ only routes */}
        <Route element={<GuardedLayout requireMinRole="manager" requiredPermission={{ moduleId: "exec_activity_log", action: "view" }} />}>
          <Route path="/activity-log" element={<ActivityLogPageWrapper />} />
        </Route>

        {/* Executive only routes */}
        <Route element={<GuardedLayout allowedDepartments={["Executive"]} requiredPermission={{ moduleId: "exec_users", action: "view" }} />}>
          <Route path="/admin/users" element={<UserManagementPage />} />
          <Route path="/admin/users/new" element={<CreateUserPageWrapper />} />
          <Route path="/admin/users/:userId" element={<UserDetailPageWrapper />} />
        </Route>

        {/* Open to all authenticated users */}
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/inbox" element={<InboxPageWrapper />} />
        <Route path="/my-evouchers" element={<MyEVouchersPageWrapper />} />
        <Route path="/evouchers/:id/disburse" element={<RouteWrapper page="acct-evouchers"><DisburseEVoucherPage /></RouteWrapper>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/design-system" element={<DesignSystemPage />} />
        
        {/* Diagnostics (hidden utility page) */}
        <Route path="/diagnostics" element={<DiagnosticsPage />} />
        <Route path="/supabase-debug" element={<RouteWrapper page="admin"><SupabaseDebug /></RouteWrapper>} />
        
        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
    </>
    </FeedbackPositionProvider>
  );
}

function PostHogPageView() {
  const location = useLocation();
  useEffect(() => {
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [location.pathname]);
  return null;
}

export default function App() {
  // Inject Google Fonts dynamically to avoid CSS @import issues
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      if (link.parentNode) {
        document.head.removeChild(link);
      }
    };
  }, []);

  return (
    <UserProvider>
      <PermissionProvider>
        <BrowserRouter>
          <PostHogPageView />
          <AppContent />
        </BrowserRouter>
      </PermissionProvider>
    </UserProvider>
  );
}
