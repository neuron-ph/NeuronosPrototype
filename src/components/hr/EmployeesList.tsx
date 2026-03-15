import React, { useState } from "react";
import { cn } from "../ui/utils";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { toast } from "../ui/toast-utils";

interface EmployeeRowData {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  middleName: string;
  fullName: string;
  company: string;
  designation: string;
  regularization: string;
  birthdate: string;
  email: string;
  contactNumber: string;
  status: "Active" | "Separated";
  rateType?: "Monthly" | "Daily";
  salary?: number;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyContact: string;
  sssNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  tinNumber: string;
}

interface CompanyGroup {
  companyName: string;
  subtitle: string;
  employees: EmployeeRowData[];
}

interface EmployeesListProps {
  filterCompany: string;
  userRole: 'rep' | 'manager' | 'director';
  onEmployeeClick: (employee: EmployeeRowData) => void;
}

const EMPLOYEE_DATA: CompanyGroup[] = [
  {
    companyName: "Conforme Cargo Express",
    subtitle: "Source: Excel roster 2025",
    employees: [
      {
        id: "cce-1",
        employeeId: "CCE-087-01043",
        firstName: "Gerlie",
        lastName: "Paycana",
        middleName: "Jasto",
        fullName: "Paycana, Gerlie",
        company: "Conforme Cargo Express",
        designation: "Vice President",
        regularization: "12/2/2017",
        birthdate: "1/16/1975",
        email: "gerlie@conformecargoexpress.com",
        contactNumber: "(+63) 9108019804",
        status: "Active",
        rateType: "Monthly",
        salary: 85000,
        emergencyName: "Janus Matthew Paycana",
        emergencyRelationship: "Son",
        emergencyContact: "(+63) 918 778 5232",
        sssNumber: "0064-4655-964",
        philhealthNumber: "02-05058289-80",
        pagibigNumber: "",
        tinNumber: "",
      },
      {
        id: "cce-2",
        employeeId: "CCE-087-02142",
        firstName: "Pablo Jr.",
        lastName: "Valera",
        middleName: "Falcis",
        fullName: "Valera, Pablo Jr.",
        company: "Conforme Cargo Express",
        designation: "Operations Manager",
        regularization: "5/13/2019",
        birthdate: "12/5/1986",
        email: "pablo@conformecargoexpress.com",
        contactNumber: "(+63) 94512536744",
        status: "Active",
        rateType: "Monthly",
        salary: 45000,
        emergencyName: "Rosemarie Valera",
        emergencyRelationship: "Wife",
        emergencyContact: "3394-385-868",
        sssNumber: "00-8565176-34",
        philhealthNumber: "2-12017326-84",
        pagibigNumber: "",
        tinNumber: "",
      },
      {
        id: "cce-3",
        employeeId: "CCE-087-03571",
        firstName: "Christine Joy",
        lastName: "Turgo",
        middleName: "Rutiaquo",
        fullName: "Turgo, Christine Joy",
        company: "Conforme Cargo Express",
        designation: "IMPEX Supervisor",
        regularization: "3/1/2021",
        birthdate: "3/28/1995",
        email: "christine@conformecargoexpress.com",
        contactNumber: "(+63) 927 771 5560",
        status: "Active",
        rateType: "Monthly",
        salary: 32000,
        emergencyName: "Rosa R. Turgo",
        emergencyRelationship: "Mother",
        emergencyContact: "346-274-843",
        sssNumber: "132006750293",
        philhealthNumber: "1-22106752-03",
        pagibigNumber: "",
        tinNumber: "",
      },
      {
        id: "cce-4",
        employeeId: "CCE-087-03576",
        firstName: "Jake",
        lastName: "Balagt",
        middleName: "Bula",
        fullName: "Balagt, Jake",
        company: "Conforme Cargo Express",
        designation: "Company Driver",
        regularization: "8/8/2023",
        birthdate: "10/12/1989",
        email: "jake@libergroupscompanies.com",
        contactNumber: "(+63) 977 629 4406",
        status: "Active",
        rateType: "Daily",
        salary: 750,
        emergencyName: "Reina O. Honrales",
        emergencyRelationship: "Wife",
        emergencyContact: "342-5384-913",
        sssNumber: "132006750293",
        philhealthNumber: "1-22106752-03",
        pagibigNumber: "",
        tinNumber: "",
      },
      {
        id: "cce-5",
        employeeId: "CCE-087-03579",
        firstName: "Ronald",
        lastName: "Javier",
        middleName: "Salvino",
        fullName: "Javier, Ronald",
        company: "Conforme Cargo Express",
        designation: "Admin Staff",
        regularization: "9/5/2023",
        birthdate: "5/14/1985",
        email: "ronald@libergroupscompanies.com",
        contactNumber: "(+63) 905 579 0391",
        status: "Active",
        rateType: "Monthly",
        salary: 22000,
        emergencyName: "Rihanna Javier",
        emergencyRelationship: "Daughter",
        emergencyContact: "341 089 034",
        sssNumber: "02066196327",
        philhealthNumber: "",
        pagibigNumber: "",
        tinNumber: "",
      },
      {
        id: "cce-6",
        employeeId: "CCE-087-04568",
        firstName: "Arliane",
        lastName: "Arciga",
        middleName: "Ramos",
        fullName: "Arciga, Arliane",
        company: "Conforme Cargo Express",
        designation: "IMPEX Assistant",
        regularization: "10/24/2022",
        birthdate: "5/4/1989",
        email: "arcilane@libergroupscompanies.com",
        contactNumber: "(+63) 9650674821",
        status: "Active",
        rateType: "Monthly",
        salary: 25000,
        emergencyName: "These Arciga",
        emergencyRelationship: "Wife",
        emergencyContact: "038-8086-775",
        sssNumber: "19-025177331-08",
        philhealthNumber: "",
        pagibigNumber: "",
        tinNumber: "",
      },
    ],
  },
  {
    companyName: "ZEUJ One Marketing International",
    subtitle: "Source: Excel roster 2025",
    employees: [
      {
        id: "zeuj-1",
        employeeId: "ZEUJ-048",
        firstName: "Sheila Mae",
        lastName: "Amando",
        middleName: "Aruna",
        fullName: "Amando, Sheila Mae",
        company: "ZEUJ One Marketing International",
        designation: "Accounting Head",
        regularization: "8/3/2022",
        birthdate: "8/28/2000",
        email: "sheila@zeujonemarketinginternational.com",
        contactNumber: "(+63) 9456234789",
        status: "Active",
        emergencyName: "Marilyn Amando",
        emergencyRelationship: "Mother",
        emergencyContact: "(+63) 9286442346",
        sssNumber: "172-8849473",
        philhealthNumber: "08-5344518821-2",
        pagibigNumber: "",
        tinNumber: "121636412-6",
      },
      {
        id: "zeuj-2",
        employeeId: "ZEUJ-052",
        firstName: "Carlos",
        lastName: "Rivera",
        middleName: "Santos",
        fullName: "Rivera, Carlos",
        company: "ZEUJ One Marketing International",
        designation: "Marketing Manager",
        regularization: "1/15/2023",
        birthdate: "3/12/1992",
        email: "carlos@zeujonemarketinginternational.com",
        contactNumber: "(+63) 9178834521",
        status: "Active",
        emergencyName: "Elena Rivera",
        emergencyRelationship: "Wife",
        emergencyContact: "(+63) 9156782341",
        sssNumber: "145-2241889",
        philhealthNumber: "05-1234567-89",
        pagibigNumber: "",
        tinNumber: "234567890-1",
      },
    ],
  },
  {
    companyName: "Juan Logistica Courier Services",
    subtitle: "Source: Excel roster 2025",
    employees: [
      {
        id: "juan-1",
        employeeId: "JUAN-P-1049",
        firstName: "Roselyn",
        lastName: "Ayubabar",
        middleName: "Mendez",
        fullName: "Ayubabar, Roselyn",
        company: "Juan Logistica Courier Services",
        designation: "Admin Assistant",
        regularization: "04/05/2024",
        birthdate: "4/4/1999",
        email: "roselyn@juanlogisticacourierservices.com",
        contactNumber: "(+63) 9485651738",
        status: "Active",
        emergencyName: "Lilian M. Alcazar",
        emergencyRelationship: "Mother",
        emergencyContact: "(+63) 9446448923",
        sssNumber: "34-6886-885",
        philhealthNumber: "01-03659379-07",
        pagibigNumber: "",
        tinNumber: "9-22139476-9",
      },
      {
        id: "juan-2",
        employeeId: "JUAN-P-1052",
        firstName: "Miguel",
        lastName: "Fernandez",
        middleName: "Lopez",
        fullName: "Fernandez, Miguel",
        company: "Juan Logistica Courier Services",
        designation: "Courier Supervisor",
        regularization: "6/20/2023",
        birthdate: "7/18/1988",
        email: "miguel@juanlogisticacourierservices.com",
        contactNumber: "(+63) 9274561230",
        status: "Active",
        emergencyName: "Ana Fernandez",
        emergencyRelationship: "Sister",
        emergencyContact: "(+63) 9183456789",
        sssNumber: "28-4456-772",
        philhealthNumber: "02-08765432-10",
        pagibigNumber: "",
        tinNumber: "8-33445566-7",
      },
    ],
  },
  {
    companyName: "ZN International Cargo Forwarding",
    subtitle: "Source: Excel roster 2025",
    employees: [
      {
        id: "zn-1",
        employeeId: "ZN-P77-1602",
        firstName: "Christian Patrick",
        lastName: "Reral",
        middleName: "Sanchez",
        fullName: "Reral, Christian Patrick",
        company: "ZN International Cargo Forwarding",
        designation: "Managing Director",
        regularization: "8/4/2025",
        birthdate: "10/12/1998",
        email: "christian@zninternational.com",
        contactNumber: "(+63) 9158969401",
        status: "Active",
        emergencyName: "Bejo Noel Rida",
        emergencyRelationship: "Father",
        emergencyContact: "(+63) 9158330389",
        sssNumber: "340904-585",
        philhealthNumber: "08-02575387-04",
        pagibigNumber: "",
        tinNumber: "7-32727934-4",
      },
      {
        id: "zn-2",
        employeeId: "ZN-U7-1451",
        firstName: "Prince Harvey",
        lastName: "Barcellon",
        middleName: "Sebulon",
        fullName: "Barcellon, Prince Harvey",
        company: "ZN International Cargo Forwarding",
        designation: "CHSS Agent",
        regularization: "9/9/2023",
        birthdate: "1/4/2000",
        email: "prince@zninternational.com",
        contactNumber: "(+63) 9170341145",
        status: "Active",
        emergencyName: "Jemma M. Barcellon",
        emergencyRelationship: "Mother",
        emergencyContact: "9155325831",
        sssNumber: "1-3-27170-2271",
        philhealthNumber: "",
        pagibigNumber: "",
        tinNumber: "9-34175336-4",
      },
      {
        id: "zn-3",
        employeeId: "ZN-P77-1597",
        firstName: "Liancel",
        lastName: "Morfe",
        middleName: "Moreno",
        fullName: "Morfe, Liancel",
        company: "ZN International Cargo Forwarding",
        designation: "Operations Supervisor",
        regularization: "8/6/2024",
        birthdate: "10/27/1996",
        email: "liancel@zninternational.com",
        contactNumber: "(+63) 9214780481",
        status: "Active",
        emergencyName: "Arjun Morfe",
        emergencyRelationship: "Brother",
        emergencyContact: "9-47584236481",
        sssNumber: "1-15-31-1651",
        philhealthNumber: "",
        pagibigNumber: "",
        tinNumber: "7-31575667-90",
      },
    ],
  },
];

const getInitials = (name: string): string => {
  const parts = name.split(", ");
  if (parts.length === 2) {
    const lastName = parts[0];
    const firstName = parts[1];
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

export function EmployeesList({ filterCompany, userRole, onEmployeeClick }: EmployeesListProps) {
  const filteredData = filterCompany === "All"
    ? EMPLOYEE_DATA
    : EMPLOYEE_DATA.filter((group) => group.companyName === filterCompany);

  const isAdmin = userRole === "director";

  const handleSuspendEmployee = (employee: EmployeeRowData, e: React.MouseEvent) => {
    e.stopPropagation();
    toast.success(`${employee.fullName} has been suspended`);
  };

  return (
    <div
      className="bg-white border border-[#E5E7EB] rounded-[20px] overflow-visible flex flex-col"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-[#E5E7EB] flex-shrink-0"
        style={{ padding: "20px 24px" }}
      >
        <h2
          className="text-[#0A1D4D]"
          style={{ fontSize: "18px", fontWeight: 600 }}
        >
          Employees (by company roster)
        </h2>
      </div>

      {/* List (no scroll - page-level scrolling) */}
      <div className="flex-1" style={{ padding: "0" }}>
        {filteredData.map((group, groupIdx) => (
          <div key={groupIdx} className="border-b border-[#E5E7EB] last:border-b-0">
            {/* Company Section Header */}
            <div
              className="sticky top-0 bg-[#F9FAFB] border-b border-[#E5E7EB] z-10"
              style={{ padding: "16px 24px" }}
            >
              <h3
                className="text-[#0A1D4D]"
                style={{ fontSize: "14px", fontWeight: 600 }}
              >
                {group.companyName}
              </h3>
              <p className="text-[11px] text-[#6B7280] mt-1">{group.subtitle}</p>
            </div>

            {/* Table Header */}
            <div className="bg-white border-b border-[#E5E7EB]" style={{ padding: "0 24px" }}>
              <div className="grid grid-cols-12 gap-4 py-3">
                <div className="col-span-4">
                  <p
                    className="text-[#6B7280] uppercase tracking-wide"
                    style={{ fontSize: "11px", fontWeight: 600 }}
                  >
                    Name
                  </p>
                </div>
                <div className="col-span-3">
                  <p
                    className="text-[#6B7280] uppercase tracking-wide"
                    style={{ fontSize: "11px", fontWeight: 600 }}
                  >
                    Position / Designation
                  </p>
                </div>
                <div className="col-span-2">
                  <p
                    className="text-[#6B7280] uppercase tracking-wide"
                    style={{ fontSize: "11px", fontWeight: 600 }}
                  >
                    Date Hired
                  </p>
                </div>
                <div className="col-span-2">
                  <p
                    className="text-[#6B7280] uppercase tracking-wide"
                    style={{ fontSize: "11px", fontWeight: 600 }}
                  >
                    Contact
                  </p>
                </div>
                <div className="col-span-1 text-right">
                  <p
                    className="text-[#6B7280] uppercase tracking-wide"
                    style={{ fontSize: "11px", fontWeight: 600 }}
                  >
                    Action
                  </p>
                </div>
              </div>
            </div>

            {/* Employee Rows */}
            <div>
              {group.employees.map((employee, empIdx) => (
                <div
                  key={employee.id}
                  onClick={() => onEmployeeClick(employee)}
                  className="grid grid-cols-12 gap-4 py-4 border-b border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors cursor-pointer"
                  style={{ padding: "16px 24px" }}
                >
                  {/* Name with Avatar */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-full bg-[#D1FAE5] flex items-center justify-center"
                    >
                      <span
                        className="text-[#065F46]"
                        style={{ fontSize: "12px", fontWeight: 600 }}
                      >
                        {getInitials(employee.fullName)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-[#0A1D4D] truncate"
                        style={{ fontSize: "13px", fontWeight: 600 }}
                      >
                        {employee.fullName}
                      </p>
                      <p className="text-[#9CA3AF] text-[11px] truncate">
                        {employee.employeeId}
                      </p>
                    </div>
                  </div>

                  {/* Position */}
                  <div className="col-span-3 flex items-center">
                    <p className="text-[#6B7280] text-[13px] truncate">
                      {employee.designation}
                    </p>
                  </div>

                  {/* Date Hired */}
                  <div className="col-span-2 flex items-center">
                    <p className="text-[#6B7280] text-[13px]">
                      {employee.regularization}
                    </p>
                  </div>

                  {/* Contact */}
                  <div className="col-span-2 flex items-center">
                    <p className="text-[#6B7280] text-[13px] truncate">
                      {employee.contactNumber}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="col-span-1 flex items-center justify-end">
                    {isAdmin ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex items-center gap-1 text-[#0F766E] hover:text-[#0D6560] text-[12px]"
                            style={{ fontWeight: 600 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            View file
                            <MoreVertical className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[180px]">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onEmployeeClick(employee);
                            }}
                          >
                            View file
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleSuspendEmployee(employee, e)}
                            className="text-[#C93737] focus:text-[#C93737] focus:bg-[#FEE2E2]"
                          >
                            Suspend employee
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <button
                        className="text-[#0F766E] hover:text-[#0D6560] text-[12px]"
                        style={{ fontWeight: 600 }}
                      >
                        View file
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { EMPLOYEE_DATA };
export type { EmployeeRowData, CompanyGroup };