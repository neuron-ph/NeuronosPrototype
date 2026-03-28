// App entrypoint — Neuron OS
// Force recompilation: cache-bust 2026-03-12b
import { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams, Outlet } from "react-router";
import { Layout } from "./components/Layout";
import { UserProvider, useUser } from "./hooks/useUser";
import { RouteGuard } from "./components/RouteGuard";
import { AppModeProvider, useAppMode } from "./config/appMode";
import { toast, Toaster } from "sonner@2.0.3";
import type { Customer } from "./types/bd";
import { NeuronLogo } from "./components/NeuronLogo";
import { projectId } from "./utils/supabase/info";
import { useWorkspaceTheme } from "./theme/useWorkspaceTheme";

const ExecutiveDashboard = lazy(() => import("./components/ExecutiveDashboard").then((module) => ({ default: module.ExecutiveDashboard })));
const BusinessDevelopment = lazy(() => import("./components/BusinessDevelopment").then((module) => ({ default: module.BusinessDevelopment })));
const Pricing = lazy(() => import("./components/Pricing").then((module) => ({ default: module.Pricing })));
const Operations = lazy(() => import("./components/Operations").then((module) => ({ default: module.Operations })));
const ProjectsModule = lazy(() => import("./components/projects/ProjectsModule").then((module) => ({ default: module.ProjectsModule })));
const ContractsModule = lazy(() => import("./components/contracts/ContractsModule").then((module) => ({ default: module.ContractsModule })));
const Accounting = lazy(() => import("./components/accounting/Accounting").then((module) => ({ default: module.Accounting })));
const HR = lazy(() => import("./components/HR").then((module) => ({ default: module.HR })));
const InboxPage = lazy(() => import("./components/InboxPage").then((module) => ({ default: module.InboxPage })));
const ActivityLogPage = lazy(() => import("./components/ActivityLogPage").then((module) => ({ default: module.ActivityLogPage })));
const EmployeeProfile = lazy(() => import("./components/EmployeeProfile").then((module) => ({ default: module.EmployeeProfile })));
const Admin = lazy(() => import("./components/Admin").then((module) => ({ default: module.Admin })));
const ReportControlCenter = lazy(() => import("./components/bd/reports/ReportControlCenter").then((module) => ({ default: module.ReportControlCenter })));
const CreateBooking = lazy(() => import("./components/operations/CreateBooking").then((module) => ({ default: module.CreateBooking })));
const BookingFullView = lazy(() => import("./components/operations/BookingFullView").then((module) => ({ default: module.BookingFullView })));
const TruckingBookings = lazy(() => import("./components/operations/TruckingBookings").then((module) => ({ default: module.TruckingBookings })));
const BrokerageBookings = lazy(() => import("./components/operations/BrokerageBookings").then((module) => ({ default: module.BrokerageBookings })));
const MarineInsuranceBookings = lazy(() => import("./components/operations/MarineInsuranceBookings").then((module) => ({ default: module.MarineInsuranceBookings })));
const OthersBookings = lazy(() => import("./components/operations/OthersBookings").then((module) => ({ default: module.OthersBookings })));
const OperationsReports = lazy(() => import("./components/operations/OperationsReports").then((module) => ({ default: module.OperationsReports })));
const DiagnosticsPage = lazy(() => import("./components/DiagnosticsPage").then((module) => ({ default: module.DiagnosticsPage })));
const SupabaseDebug = lazy(() => import("./components/SupabaseDebug").then((module) => ({ default: module.SupabaseDebug })));
const DesignSystemGuide = lazy(() => import("./components/DesignSystemGuide").then((module) => ({ default: module.DesignSystemGuide })));
const Settings = lazy(() => import("./components/settings/Settings").then((m) => ({ default: m.Settings })));
const UserManagement = lazy(() => import("./components/admin/UserManagement").then((m) => ({ default: m.UserManagement })));

function RouteLoadingState() {
  return (
    <div className="min-h-screen w-full bg-[rgb(255,255,255)] flex items-center justify-center">
      <div className="text-center">
        <p style={{ color: "var(--neuron-ink-muted)" }}>Loading...</p>
      </div>
    </div>
  );
}

function LoginPage() {
  const { setUser, login, signup } = useUser();
  const { mode, setMode } = useAppMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [operationsRole, setOperationsRole] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    const result = await login(email, password);
    
    if (!result.success) {
      setError(result.error || "Login failed");
    } else {
      toast.success('Welcome to Neuron OS!');
    }
    
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setDebugInfo("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    setDebugInfo(`Calling signUp for ${email} against project ${projectId}...`);
    const result = await signup(email, password, name || email, {
      department: department || 'Executive',
      role: role || 'staff',
      service_type: department === 'Operations' ? (serviceType || null) : null,
      operations_role: department === 'Operations' ? (operationsRole || null) : null,
    });
    setDebugInfo(prev => prev + `\nResult: ${JSON.stringify(result)}`);

    if (!result.success) {
      setError(result.error || "Signup failed");
    } else if (result.needsConfirmation) {
      setSignupSuccess(true);
    } else {
      toast.success('Account created! Welcome to Neuron OS!');
    }

    setIsLoading(false);
  };

  const isLoginDisabled = !email || !password || isLoading;
  const isSignupDisabled = !email || !password || !department || !role || isLoading;

  if (signupSuccess) {
    return (
      <div className="min-h-screen w-full bg-[rgb(255,255,255)] flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] bg-white rounded-2xl px-12 py-10">
          <div className="flex flex-col items-center mb-8">
            <NeuronLogo height={36} />
          </div>
          <div className="text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#E8F5E9] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-[#0a1d4d]">Check your email</h2>
            <p className="text-[#667085] text-sm">
              We sent a confirmation link to <span className="text-[#0a1d4d]">{email}</span>.
              Click the link to activate your account, then come back and sign in.
            </p>
            <button
              type="button"
              onClick={() => { setSignupSuccess(false); setActiveTab("login"); }}
              className="mt-4 px-6 py-2.5 bg-[#6b9d94] text-white rounded-lg font-['Inter:Medium',sans-serif] font-medium hover:bg-[#5a8a82] transition-all duration-150"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[rgb(255,255,255)] flex items-center justify-center p-6">
      {/* Login Card */}
      <div className="w-full max-w-[420px] bg-white rounded-2xl px-12 py-10">
        {/* Logo and Header */}
        <div className="flex flex-col items-center mb-8">
          <NeuronLogo height={36} />
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => { setActiveTab("login"); setError(""); }}
            className="flex-1 py-2.5 px-3 text-sm font-medium transition-all duration-150"
            style={{
              backgroundColor: activeTab === "login" ? "#12332B" : "transparent",
              color: activeTab === "login" ? "#fff" : "#667085",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("signup"); setError(""); }}
            className="flex-1 py-2.5 px-3 text-sm font-medium transition-all duration-150 border-l border-gray-200"
            style={{
              backgroundColor: activeTab === "signup" ? "#12332B" : "transparent",
              color: activeTab === "signup" ? "#fff" : "#667085",
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Login Form */}
        {activeTab === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] placeholder:text-gray-400 focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] placeholder:text-gray-400 focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all"
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
        )}

        {/* Signup Form */}
        {activeTab === "signup" && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="signup-name" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                Full Name
              </label>
              <input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan dela Cruz"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] placeholder:text-gray-400 focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-email" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] placeholder:text-gray-400 focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-password" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] placeholder:text-gray-400 focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all"
                disabled={isLoading}
              />
            </div>

            {/* Department & Role — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="signup-department" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                  Department
                </label>
                <select
                  id="signup-department"
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); if (e.target.value !== 'Operations') { setServiceType(''); setOperationsRole(''); } }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all appearance-none"
                  disabled={isLoading}
                >
                  <option value="" disabled>Select...</option>
                  <option value="Business Development">Business Development</option>
                  <option value="Pricing">Pricing</option>
                  <option value="Operations">Operations</option>
                  <option value="Accounting">Accounting</option>
                  <option value="HR">HR</option>
                  <option value="Executive">Executive</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="signup-role" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                  Role
                </label>
                <select
                  id="signup-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all appearance-none"
                  disabled={isLoading}
                >
                  <option value="" disabled>Select...</option>
                  <option value="staff">Staff</option>
                  <option value="team_leader">Team Leader</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>

            {/* Operations-specific fields — only shown when department is Operations */}
            {department === 'Operations' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="signup-service-type" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                    Service Type
                  </label>
                  <select
                    id="signup-service-type"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all appearance-none"
                    disabled={isLoading}
                  >
                    <option value="" disabled>Select...</option>
                    <option value="Forwarding">Forwarding</option>
                    <option value="Brokerage">Brokerage</option>
                    <option value="Trucking">Trucking</option>
                    <option value="Marine Insurance">Marine Insurance</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="signup-ops-role" className="block text-[#0a1d4d] font-['Inter:Medium',sans-serif] font-medium">
                    Ops Role
                  </label>
                  <select
                    id="signup-ops-role"
                    value={operationsRole}
                    onChange={(e) => setOperationsRole(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] focus:outline-none focus:border-[#2f7f6f] focus:bg-white transition-all appearance-none"
                    disabled={isLoading}
                  >
                    <option value="" disabled>Select...</option>
                    <option value="Manager">Manager</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Handler">Handler</option>
                  </select>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSignupDisabled}
              className="w-full py-2.5 px-4 bg-[#6b9d94] text-white rounded-lg font-['Inter:Medium',sans-serif] font-medium hover:bg-[#5a8a82] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 transition-all duration-150 mt-6 text-center"
            >
              {isLoading ? "Creating account..." : "Create Account"}
            </button>

            {/* Debug panel — visible during signup for troubleshooting */}
            {debugInfo && (
              <div className="mt-3 p-3 rounded-lg bg-gray-900 text-gray-300 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto">
                {debugInfo}
              </div>
            )}
          </form>
        )}

        {/* App Mode Toggle */}
        <div className="mt-6">
          <p className="text-center text-[#667085] text-xs font-medium mb-2.5">System Mode</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("essentials")}
              className="flex-1 py-2 px-3 text-xs font-medium transition-all duration-150"
              style={{
                backgroundColor: mode === "essentials" ? "#12332B" : "transparent",
                color: mode === "essentials" ? "#fff" : "#667085",
              }}
            >
              Essentials
            </button>
            <button
              type="button"
              onClick={() => setMode("full")}
              className="flex-1 py-2 px-3 text-xs font-medium transition-all duration-150 border-l border-gray-200"
              style={{
                backgroundColor: mode === "full" ? "#12332B" : "transparent",
                color: mode === "full" ? "#fff" : "#667085",
              }}
            >
              Full Suite
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-xs">
            Powered by Supabase Auth
          </p>
          <p className="text-gray-400 text-sm mt-1">
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
    if (path.startsWith("/bd/reports")) return "bd-reports";
    if (path.startsWith("/pricing/contacts")) return "pricing-contacts";
    if (path.startsWith("/pricing/customers")) return "pricing-customers";
    if (path.startsWith("/pricing/quotations")) return "pricing-quotations";
    if (path.startsWith("/pricing/projects")) return "pricing-projects";
    if (path.startsWith("/pricing/contracts")) return "pricing-contracts";
    if (path.startsWith("/pricing/vendors")) return "pricing-vendors";
    if (path.startsWith("/pricing/reports")) return "pricing-reports";
    if (path.startsWith("/operations/forwarding")) return "ops-forwarding";
    if (path.startsWith("/operations/brokerage")) return "ops-brokerage";
    if (path.startsWith("/operations/trucking")) return "ops-trucking";
    if (path.startsWith("/operations/marine-insurance")) return "ops-marine-insurance";
    if (path.startsWith("/operations/others")) return "ops-others";
    if (path.startsWith("/operations/reports")) return "ops-reports";
    if (path.startsWith("/operations")) return "operations";
    if (path.startsWith("/projects")) return "projects";
    if (path.startsWith("/contracts")) return "contracts";
    if (path.startsWith("/accounting/transactions")) return "acct-transactions";
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
    if (path.startsWith("/accounting/reports")) return "acct-reports";
    if (path.startsWith("/accounting/catalog")) return "acct-catalog";
    if (path.startsWith("/hr")) return "hr";
    if (path.startsWith("/calendar")) return "calendar";
    if (path.startsWith("/inbox")) return "inbox";
    if (path.startsWith("/activity-log")) return "activity-log";
    if (path.startsWith("/settings")) return "settings";
    if (path.startsWith("/admin/users")) return "admin-users";
    if (path.startsWith("/admin")) return "admin";
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
      "bd-reports": "/bd/reports",
      "pricing-contacts": "/pricing/contacts",
      "pricing-customers": "/pricing/customers",
      "pricing-quotations": "/pricing/quotations",
      "pricing-projects": "/pricing/projects",
      "pricing-contracts": "/pricing/contracts",
      "pricing-vendors": "/pricing/vendors",
      "pricing-reports": "/pricing/reports",
      "operations": "/operations",
      "ops-forwarding": "/operations/forwarding",
      "ops-brokerage": "/operations/brokerage",
      "ops-trucking": "/operations/trucking",
      "ops-marine-insurance": "/operations/marine-insurance",
      "ops-others": "/operations/others",
      "ops-reports": "/operations/reports",
      "acct-transactions": "/accounting/transactions",
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
      "acct-reports": "/accounting/reports",
      "acct-catalog": "/accounting/catalog",
      "hr": "/hr",
      "calendar": "/calendar",
      "inbox": "/inbox",
      "activity-log": "/activity-log",
      "settings": "/settings",
      "admin-users": "/admin/users",
      "admin": "/admin",
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

function BDReportsPage() {
  const navigate = useNavigate();
  
  const handleBack = () => {
    // For now, just refresh or stay on reports
    // In future, this could navigate to a reports list view
  };
  
  return (
    <RouteWrapper page="bd-reports">
      <ReportControlCenter onBack={handleBack} />
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

function PricingReportsPage() {
  const { user } = useUser();
  return (
    <RouteWrapper page="pricing-reports">
      <Pricing view="reports" currentUser={user} />
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
  
  // TODO: Fetch booking data based on bookingId
  const booking = null;
  
  if (!booking) {
    return (
      <RouteWrapper page="operations">
        <div className="h-full flex items-center justify-center" style={{ background: "var(--neuron-bg-page)" }}>
          <div className="text-center">
            <h2 style={{ color: "var(--neuron-ink-primary)" }} className="mb-2">Booking Not Found</h2>
            <p style={{ color: "var(--neuron-ink-muted)" }}>Booking ID: {bookingId}</p>
            <button 
              onClick={() => navigate('/operations')}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                background: 'var(--neuron-brand-green)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
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
      <BookingFullView booking={booking} onBack={() => navigate('/operations')} />
    </RouteWrapper>
  );
}

function AccountingTransactionsPage() {
  return (
    <RouteWrapper page="acct-transactions">
      <Accounting view="transactions" />
    </RouteWrapper>
  );
}

// Accounting Routes
function AccountingEVouchersPage() {
  return (
    <RouteWrapper page="acct-evouchers">
      <Accounting view="evouchers" />
    </RouteWrapper>
  );
}

function AccountingInvoicesPage() {
  return (
    <RouteWrapper page="acct-invoices">
      <Accounting view="invoices" />
    </RouteWrapper>
  );
}

function AccountingBillingsPage() {
  return (
    <RouteWrapper page="acct-billings">
      <Accounting view="billings" />
    </RouteWrapper>
  );
}

function AccountingCollectionsPage() {
  return (
    <RouteWrapper page="acct-collections">
      <Accounting view="collections" />
    </RouteWrapper>
  );
}

function AccountingExpensesPage() {
  return (
    <RouteWrapper page="acct-expenses">
      <Accounting view="expenses" />
    </RouteWrapper>
  );
}

function AccountingLedgerPage() {
  return (
    <RouteWrapper page="acct-ledger">
      <Accounting view="ledger" />
    </RouteWrapper>
  );
}

function AccountingReportsPage() {
  return (
    <RouteWrapper page="acct-reports">
      <Accounting view="reports" />
    </RouteWrapper>
  );
}

function AccountingCoaPage() {
  return (
    <RouteWrapper page="acct-coa">
      <Accounting view="coa" />
    </RouteWrapper>
  );
}

function AccountingProjectsPage() {
  return (
    <RouteWrapper page="acct-projects">
      <Accounting view="projects" />
    </RouteWrapper>
  );
}

function AccountingContractsPage() {
  return (
    <RouteWrapper page="acct-contracts">
      <Accounting view="contracts" />
    </RouteWrapper>
  );
}

function AccountingCustomersPage() {
  return (
    <RouteWrapper page="acct-customers">
      <Accounting view="customers" />
    </RouteWrapper>
  );
}

function AccountingBookingsPage() {
  return (
    <RouteWrapper page="acct-bookings">
      <Accounting view="bookings" />
    </RouteWrapper>
  );
}

function AccountingCatalogPage() {
  return (
    <RouteWrapper page="acct-catalog">
      <Accounting view="catalog" />
    </RouteWrapper>
  );
}

function AccountingFinancialsPage() {
  return (
    <RouteWrapper page="acct-financials">
      <Accounting view="financials" />
    </RouteWrapper>
  );
}

// Other Routes
function DashboardPage() {
  const { user } = useUser();
  return (
    <RouteWrapper page="dashboard">
      <ExecutiveDashboard currentUser={user} />
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
      <div className="h-full flex items-center justify-center" style={{ background: "var(--neuron-bg-page)" }}>
        <div className="text-center">
          <h2 style={{ color: "var(--neuron-ink-primary)" }} className="mb-2">My Calendar</h2>
          <p style={{ color: "var(--neuron-ink-muted)" }}>Coming soon...</p>
        </div>
      </div>
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

function AdminPage() {
  return (
    <RouteWrapper page="admin">
      <Admin />
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

// Layout route that enforces department/role guards on child routes
function GuardedLayout({ allowedDepartments, requireMinRole }: { allowedDepartments?: string[]; requireMinRole?: "staff" | "team_leader" | "manager" }) {
  return (
    <RouteGuard allowedDepartments={allowedDepartments} requireMinRole={requireMinRole}>
      <Outlet />
    </RouteGuard>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useUser();
  useWorkspaceTheme();

  // Show loading state while checking auth
  if (isLoading) {
    return <RouteLoadingState />;
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="bottom-right" richColors />
        <Suspense fallback={<RouteLoadingState />}>
          <Routes>
            <Route path="/supabase-debug" element={<SupabaseDebug />} />
            <Route path="*" element={<LoginPage />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  return (
    <>
      <Toaster position="bottom-right" richColors />
      <Suspense fallback={<RouteLoadingState />}>
      <Routes>
        {/* Default route */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* Dashboard */}
        <Route path="/dashboard" element={<DashboardPage />} />
        
        {/* Business Development — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Business Development']} />}>
          <Route path="/bd/contacts" element={<BDContactsPage />} />
          <Route path="/bd/contacts/:contactId" element={<BDContactsPage />} />
          <Route path="/bd/customers" element={<BDCustomersPage />} />
          <Route path="/bd/inquiries" element={<BDInquiriesPage />} />
          <Route path="/bd/inquiries/:inquiryId" element={<BDInquiriesPage />} />
          <Route path="/bd/tasks" element={<BDTasksPage />} />
          <Route path="/bd/projects" element={<BDProjectsPage />} />
          <Route path="/bd/contracts" element={<BDContractsPage />} />
          <Route path="/bd/activities" element={<BDActivitiesPage />} />
          <Route path="/bd/budget-requests" element={<BDBudgetRequestsPage />} />
          <Route path="/bd/reports" element={<BDReportsPage />} />
        </Route>
        
        {/* Unified Projects Page */}
        <Route path="/projects" element={<ProjectsPage />} />
        
        {/* Unified Contracts Page */}
        <Route path="/contracts" element={<ContractsPage />} />
        
        {/* Pricing — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Pricing']} />}>
          <Route path="/pricing/contacts" element={<PricingContactsPage />} />
          <Route path="/pricing/customers" element={<PricingCustomersPage />} />
          <Route path="/pricing/quotations" element={<PricingQuotationsPage />} />
          <Route path="/pricing/quotations/:inquiryId" element={<PricingQuotationsPage />} />
          <Route path="/pricing/projects" element={<PricingProjectsPage />} />
          <Route path="/pricing/contracts" element={<PricingContractsPage />} />
          <Route path="/pricing/vendors" element={<PricingVendorsPage />} />
          <Route path="/pricing/reports" element={<PricingReportsPage />} />
        </Route>
        
        {/* Operations — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Operations']} />}>
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/operations/create" element={<CreateBookingPage />} />
          <Route path="/operations/:bookingId" element={<BookingDetailPage />} />
          <Route path="/operations/forwarding" element={<ForwardingBookingsPage />} />
          <Route path="/operations/trucking" element={<RouteWrapper page="ops-trucking"><TruckingBookings /></RouteWrapper>} />
          <Route path="/operations/brokerage" element={<RouteWrapper page="ops-brokerage"><BrokerageBookings /></RouteWrapper>} />
          <Route path="/operations/marine-insurance" element={<RouteWrapper page="ops-marine-insurance"><MarineInsuranceBookings /></RouteWrapper>} />
          <Route path="/operations/others" element={<RouteWrapper page="ops-others"><OthersBookings /></RouteWrapper>} />
          <Route path="/operations/reports" element={<RouteWrapper page="ops-reports"><OperationsReports /></RouteWrapper>} />
        </Route>
        
        {/* Accounting — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['Accounting']} />}>
          <Route path="/accounting/transactions" element={<AccountingTransactionsPage />} />
          <Route path="/accounting/evouchers" element={<AccountingEVouchersPage />} />
          <Route path="/accounting/invoices" element={<AccountingInvoicesPage />} />
          <Route path="/accounting/billings" element={<AccountingBillingsPage />} />
          <Route path="/accounting/collections" element={<AccountingCollectionsPage />} />
          <Route path="/accounting/expenses" element={<AccountingExpensesPage />} />
          <Route path="/accounting/coa" element={<AccountingCoaPage />} />
          <Route path="/accounting/ledger" element={<AccountingLedgerPage />} />
          <Route path="/accounting/projects" element={<AccountingProjectsPage />} />
          <Route path="/accounting/contracts" element={<AccountingContractsPage />} />
          <Route path="/accounting/customers" element={<AccountingCustomersPage />} />
          <Route path="/accounting/bookings" element={<AccountingBookingsPage />} />
          <Route path="/accounting/reports" element={<AccountingReportsPage />} />
          <Route path="/accounting/catalog" element={<AccountingCatalogPage />} />
          <Route path="/accounting/financials" element={<AccountingFinancialsPage />} />
        </Route>
        
        {/* HR — guarded */}
        <Route element={<GuardedLayout allowedDepartments={['HR']} />}>
          <Route path="/hr" element={<HRPage />} />
        </Route>

        {/* Manager+ only routes */}
        <Route element={<GuardedLayout requireMinRole="manager" />}>
          <Route path="/activity-log" element={<ActivityLogPageWrapper />} />
        </Route>

        {/* Executive only routes — PermissionsHub lives here */}
        <Route element={<GuardedLayout allowedDepartments={["Executive"]} />}>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/users" element={<UserManagementPage />} />
        </Route>

        {/* Open to all authenticated users */}
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/inbox" element={<InboxPageWrapper />} />
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
  );
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
      <AppModeProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AppModeProvider>
    </UserProvider>
  );
}
