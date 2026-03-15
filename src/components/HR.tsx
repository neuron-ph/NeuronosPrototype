import React, { useState } from "react";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  User,
  Clock,
  PhilippinePeso,
  Plus,
  Download,
  Edit,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "./ui/utils";
import { EmployeeProfileModal } from "./hr/EmployeeProfileModal";
import { CreatePayrollModal } from "./hr/CreatePayrollModal";
import { PayrollDetailsModal } from "./hr/PayrollDetailsModal";
import { PayrollPayslipsModal } from "./hr/PayrollPayslipsModal";
import { EmployeesList } from "./hr/EmployeesList";
import { EmployeeFileModal } from "./hr/EmployeeFileModal";
import { EditableTimekeepingCell } from "./hr/EditableTimekeepingCell";
import type { EmployeeRowData } from "./hr/EmployeesList";
import { toast } from "./ui/toast-utils";

type HRSection = "Profile" | "Timekeeping" | "Payroll";

const COMPANIES = [
  "Conforme Cargo Express",
  "ZEUJ One Marketing International",
  "Juan Logistica Courier Services",
  "ZN International Cargo Forwarding",
];

interface Employee {
  id: string;
  employeeId: string;
  fullName: string;
  company: string;
  position: string;
  status: "Active" | "Separated";
  dateHired: string;
  lastPayroll: string;
}

const MOCK_EMPLOYEES: Employee[] = [
  {
    id: "e1",
    employeeId: "0001",
    fullName: "Gerona, Gerlie",
    company: "CCE",
    position: "Admin Assistant",
    status: "Active",
    dateHired: "2023-05-12",
    lastPayroll: "Oct 1–15, 2025",
  },
  {
    id: "e2",
    employeeId: "0002",
    fullName: "Valera, Pablo Jr.",
    company: "ZEUJ",
    position: "Warehouse Staff",
    status: "Active",
    dateHired: "2024-01-03",
    lastPayroll: "Oct 1–15, 2025",
  },
  {
    id: "e3",
    employeeId: "0003",
    fullName: "Turgo, Christine Joy",
    company: "JUAN",
    position: "Driver",
    status: "Active",
    dateHired: "2022-10-22",
    lastPayroll: "Oct 1–15, 2025",
  },
  {
    id: "e4",
    employeeId: "0004",
    fullName: "Morfe, Liancel",
    company: "CCE",
    position: "Operations Staff",
    status: "Active",
    dateHired: "2023-08-15",
    lastPayroll: "Oct 1–15, 2025",
  },
  {
    id: "e5",
    employeeId: "0005",
    fullName: "Santos, Maria",
    company: "ZN INT.",
    position: "Accounting Clerk",
    status: "Active",
    dateHired: "2023-11-20",
    lastPayroll: "Oct 1–15, 2025",
  },
  {
    id: "e6",
    employeeId: "0006",
    fullName: "Cruz, Roberto",
    company: "ZEUJ",
    position: "Warehouse Manager",
    status: "Active",
    dateHired: "2021-03-10",
    lastPayroll: "Oct 1–15, 2025",
  },
];

interface HRProps {
  userRole: 'rep' | 'manager' | 'director';
}

export function HR({ userRole }: HRProps) {
  const [activeSection, setActiveSection] = useState<HRSection>("Profile");
  const [filterCompany, setFilterCompany] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Active");
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [createPayrollOpen, setCreatePayrollOpen] = useState(false);
  const [payrollDetailsOpen, setPayrollDetailsOpen] = useState(false);
  const [payslipsModalOpen, setPayslipsModalOpen] = useState(false);
  const [selectedPayrollCompany, setSelectedPayrollCompany] = useState("");
  const [currentWeek, setCurrentWeek] = useState("Oct 1–7");
  const [employeeFileOpen, setEmployeeFileOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRowData | null>(null);

  const navItems = [
    { id: "Profile" as HRSection, label: "Profile", icon: User },
    { id: "Timekeeping" as HRSection, label: "Timekeeping", icon: Clock },
    { id: "Payroll" as HRSection, label: "Payroll", icon: PhilippinePeso },
  ];

  const getCompanyColor = (company: string) => {
    const colors: Record<string, string> = {
      "Conforme Cargo Express": "bg-[#FEF3C7] text-[#92400E]",
      "ZEUJ One Marketing International": "bg-[#DBEAFE] text-[#1E40AF]",
      "Juan Logistica Courier Services": "bg-[#FED7AA] text-[#9A3412]",
      "ZN International Cargo Forwarding": "bg-[#E0E7FF] text-[#3730A3]",
    };
    return colors[company] || "bg-gray-200 text-gray-800";
  };

  const handleOpenPayrollDetails = (company: string) => {
    setSelectedPayrollCompany(company);
    setPayrollDetailsOpen(true);
  };

  const filteredEmployees = MOCK_EMPLOYEES.filter((emp) => {
    if (filterCompany !== "All" && emp.company !== filterCompany) return false;
    if (filterStatus !== "All" && emp.status !== filterStatus) return false;
    return true;
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
      }}
    >
      {/* Main Content */}
      <div
        style={{
          padding: "32px 48px",
          maxWidth: "100%",
          margin: "0 auto",
        }}
      >
        {/* Page Header Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "#12332B", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              HR
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              Manage your Human Resources.
            </p>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          className="bg-white border border-[#E5E7EB] rounded-[16px]"
          style={{
            padding: "16px 20px",
            marginBottom: "16px",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger
                  className="h-11 rounded-full border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors duration-150 text-[13px] px-4"
                  style={{ width: "160px" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Companies</SelectItem>
                  {COMPANIES.map((company) => (
                    <SelectItem key={company} value={company}>
                      {company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-shrink-0">
              <Select value="Oct 1–15, 2025" onValueChange={() => {}}>
                <SelectTrigger
                  className="h-11 rounded-full border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors duration-150 text-[13px] px-4"
                  style={{ width: "180px" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Oct 1–15, 2025">Oct 1–15, 2025</SelectItem>
                  <SelectItem value="Oct 16–31, 2025">Oct 16–31, 2025</SelectItem>
                  <SelectItem value="Sep 1–15, 2025">Sep 1–15, 2025</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-shrink-0">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger
                  className="h-11 rounded-full border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors duration-150 text-[13px] px-4"
                  style={{ width: "120px" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Pill-style Tabs - Similar to Accounting */}
        <div style={{ marginBottom: "16px" }}>
          <div
            className="flex items-center gap-2 bg-white border border-[#E6E9F0] rounded-2xl"
            style={{
              height: "56px",
              padding: "8px 12px",
            }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] transition-all"
                  )}
                  style={{
                    fontWeight: activeSection === item.id ? 600 : 500,
                    backgroundColor: activeSection === item.id ? "#E4EFEA" : "transparent",
                    border: activeSection === item.id ? "1.5px solid #5FC4A1" : "1.5px solid transparent",
                    color: activeSection === item.id ? "#237F66" : "#6B7280",
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* HR Page Content Container */}
        <div
          style={{
            background: "transparent",
          }}
        >
          {/* Content Area - Full width without left sidebar */}
          <div>
            {activeSection === "Profile" && (
              <EmployeesList
                filterCompany={filterCompany}
                userRole={userRole}
                onEmployeeClick={(employee) => {
                  setSelectedEmployee(employee);
                  setEmployeeFileOpen(true);
                }}
              />
            )}

            {activeSection === "Timekeeping" && (
              <div
                className="bg-white border border-[#E5E7EB] rounded-[20px] overflow-visible flex flex-col"
              >
                {/* Timekeeping Header */}
                <div
                  className="flex items-center justify-between border-b border-[#E5E7EB] flex-shrink-0"
                  style={{ padding: "20px 24px" }}
                >
                  <h2
                    className="text-[#0A1D4D]"
                    style={{ fontSize: "18px", fontWeight: 600 }}
                  >
                    Weekly Timekeeping Board
                  </h2>
                </div>

                {/* Toolbar */}
                <div
                  className="flex items-center justify-between border-b border-[#E5E7EB] flex-shrink-0"
                  style={{ padding: "16px 24px" }}
                >
                  <div className="flex-shrink-0">
                    <Select value={filterCompany} onValueChange={setFilterCompany}>
                      <SelectTrigger
                        className="h-9 rounded-full border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors duration-150 text-[13px] px-4"
                        style={{ width: "140px" }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Companies</SelectItem>
                        {COMPANIES.map((company) => (
                          <SelectItem key={company} value={company}>
                            {company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toast.info("Previous week")}
                      className="p-1 hover:bg-[#F9FAFB] rounded transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
                    </button>
                    <span
                      className="text-[#0A1D4D] px-4"
                      style={{ fontSize: "14px", fontWeight: 600 }}
                    >
                      {currentWeek}
                    </span>
                    <button
                      onClick={() => toast.info("Next week")}
                      className="p-1 hover:bg-[#F9FAFB] rounded transition-colors"
                    >
                      <ChevronRight className="w-5 h-5 text-[#6B7280]" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => toast.success("Exporting...")}
                      variant="outline"
                      className="h-9 px-4 rounded-full border-[#E5E7EB] text-[13px]"
                      style={{ fontWeight: 600 }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export XLSX
                    </Button>
                  </div>
                </div>

                {/* Timesheet Grid - No internal scroll */}
                <div className="flex-1 p-6">
                  <div className="border border-[#D1D5DB] rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-[#D1D5DB]">
                      <thead className="bg-[#F9FAFB]">
                        <tr>
                          <th
                            className="px-4 py-3 text-left text-[11px] text-[#000000] uppercase border-r border-[#D1D5DB]"
                            style={{ fontWeight: 600, width: "180px" }}
                          >
                            Employee
                          </th>
                          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                            <th
                              key={day}
                              colSpan={2}
                              className="px-2 py-3 text-center text-[11px] text-[#000000] uppercase border-r border-[#D1D5DB]"
                              style={{ fontWeight: 600 }}
                            >
                              {day} – Oct – 25
                            </th>
                          ))}
                        </tr>
                        <tr>
                          <th className="border-r border-[#D1D5DB]"></th>
                          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                            <React.Fragment key={day}>
                              <th
                                className="px-2 py-2 text-center text-[10px] text-[#6B7280] uppercase border-r border-[#D1D5DB]"
                                style={{ fontWeight: 600, width: "80px" }}
                              >
                                In
                              </th>
                              <th
                                className="px-2 py-2 text-center text-[10px] text-[#6B7280] uppercase border-r border-[#D1D5DB]"
                                style={{ fontWeight: 600, width: "80px" }}
                              >
                                Out
                              </th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-[#D1D5DB]">
                        {filteredEmployees.slice(0, 10).map((emp, empIdx) => (
                          <tr key={emp.id}>
                            <td
                              className="px-4 py-3 text-[12px] text-[#0A1D4D] border-r border-[#D1D5DB]"
                              style={{ fontWeight: 500 }}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "w-2 h-2 rounded-full",
                                    emp.company === "CCE"
                                      ? "bg-[#F25C05]"
                                      : emp.company === "ZEUJ"
                                      ? "bg-[#FCD34D]"
                                      : emp.company === "JUAN"
                                      ? "bg-[#3B82F6]"
                                      : "bg-[#6366F1]"
                                  )}
                                />
                                {emp.fullName}
                              </div>
                            </td>
                            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                              const isLocked = day <= 2;
                              const initialState =
                                empIdx % 3 === 0 && day === 3
                                  ? "leave"
                                  : empIdx % 4 === 0 && day === 4
                                  ? "absent"
                                  : "time";
                              return (
                                <EditableTimekeepingCell
                                  key={`${emp.id}-${day}`}
                                  employeeId={emp.id}
                                  day={day}
                                  initialState={initialState as any}
                                  isLocked={isLocked}
                                  onUpdate={(empId, d, state, inTime, outTime) => {
                                    // Handle updates here if needed
                                    console.log(`Updated ${empId} day ${d}:`, state, inTime, outTime);
                                  }}
                                />
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="mt-4 flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#F25C05]" />
                      <span className="text-[11px] text-[#6B7280]">CCE</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#FCD34D]" />
                      <span className="text-[11px] text-[#6B7280]">ZEUJ</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#3B82F6]" />
                      <span className="text-[11px] text-[#6B7280]">JUAN</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#6366F1]" />
                      <span className="text-[11px] text-[#6B7280]">ZN INT.</span>
                    </div>
                    <div className="ml-auto text-[11px] text-[#6B7280]">
                      {currentWeek}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "Payroll" && (
              <div
                className="bg-white border border-[#E5E7EB] rounded-[20px] overflow-visible flex flex-col"
              >
                {/* Payroll Header */}
                <div
                  className="flex items-center justify-between border-b border-[#E5E7EB] flex-shrink-0"
                  style={{ padding: "20px 24px" }}
                >
                  <h2
                    className="text-[#0A1D4D]"
                    style={{ fontSize: "18px", fontWeight: 600 }}
                  >
                    Payroll Runs
                  </h2>
                  <Button
                    onClick={() => setCreatePayrollOpen(true)}
                    className="bg-[#0F766E] hover:bg-[#0D6560] text-white rounded-full h-9 px-4"
                    style={{ fontWeight: 600, fontSize: "13px" }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Payroll
                  </Button>
                </div>

                {/* Payroll Filters */}
                <div
                  className="border-b border-[#E5E7EB] flex-shrink-0"
                  style={{ padding: "16px 24px" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <Select value="Oct 1–15, 2025" onValueChange={() => {}}>
                        <SelectTrigger
                          className="h-9 rounded-full border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors duration-150 text-[13px] px-4"
                          style={{ width: "160px" }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Oct 1–15, 2025">
                            Oct 1–15, 2025
                          </SelectItem>
                          <SelectItem value="Oct 16–31, 2025">
                            Oct 16–31, 2025
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-shrink-0">
                      <Select value="All" onValueChange={() => {}}>
                        <SelectTrigger
                          className="h-9 rounded-full border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors duration-150 text-[13px] px-4"
                          style={{ width: "140px" }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All Companies</SelectItem>
                          {COMPANIES.map((company) => (
                            <SelectItem key={company} value={company}>
                              {company}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-shrink-0">
                      <Select value="All" onValueChange={() => {}}>
                        <SelectTrigger
                          className="h-9 rounded-full border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors duration-150 text-[13px] px-4"
                          style={{ width: "120px" }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All Status</SelectItem>
                          <SelectItem value="Draft">Draft</SelectItem>
                          <SelectItem value="Final">Final</SelectItem>
                          <SelectItem value="Printed">Printed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Payroll Cards Grid - No internal scroll */}
                <div className="flex-1 p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {COMPANIES.map((company, idx) => (
                      <div
                        key={company}
                        className="border border-[#E5E7EB] rounded-lg p-6 hover:border-[#0A1D4D] transition-colors cursor-pointer"
                        onClick={() => handleOpenPayrollDetails(company)}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3
                              className="text-[#0A1D4D] mb-1"
                              style={{ fontSize: "16px", fontWeight: 600 }}
                            >
                              {company}
                            </h3>
                            <p className="text-[12px] text-[#6B7280]">
                              Oct 1–15, 2025
                            </p>
                          </div>
                          <span
                            className={cn(
                              "px-3 py-1 rounded-full text-[11px]",
                              idx === 1
                                ? "bg-[#D1FAE5] text-[#065F46]"
                                : "bg-[#FEF3C7] text-[#92400E]"
                            )}
                            style={{ fontWeight: 600 }}
                          >
                            {idx === 1 ? "Final" : "Draft"}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full h-9 rounded-lg border-[#E5E7EB] text-[13px]"
                          style={{ fontWeight: 600 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPayrollCompany(company);
                            setPayslipsModalOpen(true);
                          }}
                        >
                          Print Slip
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Developer Notes - Inside scroll area */}
        <div
          className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg"
          style={{
            maxWidth: "1180px",
            width: "100%",
            margin: "24px auto",
            paddingLeft: "24px",
            paddingRight: "24px",
          }}
        >
          <p className="text-[11px] text-[#6B7280]">
            <strong>HR Notes:</strong> Frame constrained to 1440×900. Content wrapper: 1180px max-width with 24px padding. 
            Left nav: 220px fixed. Role-based access: HR + Admin roles.
            <br />
            <strong>Employee list ordering:</strong> List is ordered according to master Excel: CCE → ZEUJ → JUAN → ZN INT. 
            Do not auto-sort by name or date. HR expects this exact order. Company filter maintains internal Excel order.
            <br />
            <strong>Page scrolling:</strong> Modal tabs now use JJB-standard active underline (#FF7A00), not focus outline. 
            HR page now scrolls as one document (like the Excel source), tables no longer trap scroll.
          </p>
        </div>
      </div>

      {/* Modals */}
      <EmployeeProfileModal
        open={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        onSubmit={(data) => {
          console.log("Employee created:", data);
          setEmployeeModalOpen(false);
          toast.success("Employee profile created");
        }}
      />

      <CreatePayrollModal
        open={createPayrollOpen}
        onClose={() => setCreatePayrollOpen(false)}
        onContinue={(company, period) => {
          setSelectedPayrollCompany(company);
          setCreatePayrollOpen(false);
          setPayrollDetailsOpen(true);
        }}
      />

      <PayrollDetailsModal
        open={payrollDetailsOpen}
        onClose={() => setPayrollDetailsOpen(false)}
        company={selectedPayrollCompany}
        period="Oct 1–15, 2025"
        onSave={() => toast.success("Payroll saved")}
      />

      <PayrollPayslipsModal
        open={payslipsModalOpen}
        onClose={() => setPayslipsModalOpen(false)}
        company={selectedPayrollCompany}
        period="October 1–13, 2025"
      />

      {selectedEmployee && (
        <EmployeeFileModal
          open={employeeFileOpen}
          onClose={() => {
            setEmployeeFileOpen(false);
            setSelectedEmployee(null);
          }}
          employee={selectedEmployee}
        />
      )}
    </div>
  );
}