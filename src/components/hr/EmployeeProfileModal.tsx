import { useState } from "react";
import { X, Plus, Edit, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "../ui/utils";

interface EmployeeProfileModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

type TabType = "Personal Data" | "Employment Records" | "Documents";

const COMPANIES = ["CCE", "ZEUJ", "JUAN", "ZN INT."];
const POSITIONS = [
  "Admin Assistant",
  "Warehouse Staff",
  "Driver",
  "Operations Staff",
  "Accounting Clerk",
  "Warehouse Manager",
  "General Manager",
];

interface EmploymentRecord {
  id: string;
  company: string;
  dateHired: string;
  rateType: "Monthly" | "Daily";
  rate: number;
  status: "Active" | "Separated";
}

export function EmployeeProfileModal({
  open,
  onClose,
  onSubmit,
}: EmployeeProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("Personal Data");
  const [formData, setFormData] = useState({
    name: "",
    primaryCompany: "",
    position: "",
    birthday: "",
    address: "",
    contactNo: "",
    emergencyContact: "",
  });

  const [employmentRecords, setEmploymentRecords] = useState<
    EmploymentRecord[]
  >([
    {
      id: "1",
      company: "CCE",
      dateHired: "2023-05-12",
      rateType: "Monthly",
      rate: 29023.79,
      status: "Active",
    },
    {
      id: "2",
      company: "ZEUJ",
      dateHired: "2024-01-03",
      rateType: "Monthly",
      rate: 19800.0,
      status: "Active",
    },
    {
      id: "3",
      company: "JUAN",
      dateHired: "2022-10-22",
      rateType: "Daily",
      rate: 951.72,
      status: "Active",
    },
  ]);

  const [documents] = useState([
    { id: "1", name: "201 file.pdf", uploadedDate: "2023-05-10" },
    { id: "2", name: "SSS E1.pdf", uploadedDate: "2023-05-10" },
  ]);

  if (!open) return null;

  const tabs: TabType[] = ["Personal Data", "Employment Records", "Documents"];

  const handleSave = () => {
    onSubmit({
      ...formData,
      employmentRecords,
      documents,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[var(--theme-bg-surface)] rounded-lg shadow-2xl flex flex-col my-10"
        style={{ width: "820px", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="border-b border-[var(--theme-border-default)] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-[16px] text-[var(--theme-text-primary)]" style={{ fontWeight: 600 }}>
              Employee Profile
            </h3>
            <p className="text-[12px] text-[var(--theme-text-muted)] mt-1">
              Create or edit employee information
            </p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-[var(--theme-bg-page)]"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Top Input Fields */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="col-span-3">
                <Label className="text-[11px] text-[var(--theme-text-muted)] mb-2 block uppercase">
                  Full Name
                </Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Enter full name (Last, First M.)"
                  className="border-[var(--theme-border-default)] text-[13px] h-10 rounded"
                />
              </div>
              <div>
                <Label className="text-[11px] text-[var(--theme-text-muted)] mb-2 block uppercase">
                  Primary Company
                </Label>
                <Select
                  value={formData.primaryCompany}
                  onValueChange={(value) =>
                    setFormData({ ...formData, primaryCompany: value })
                  }
                >
                  <SelectTrigger className="border-[var(--theme-border-default)] text-[13px] h-10 rounded">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-[11px] text-[var(--theme-text-muted)] mb-2 block uppercase">
                  Position
                </Label>
                <Select
                  value={formData.position}
                  onValueChange={(value) =>
                    setFormData({ ...formData, position: value })
                  }
                >
                  <SelectTrigger className="border-[var(--theme-border-default)] text-[13px] h-10 rounded">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-6 border-b border-[var(--theme-border-default)]">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2 text-[13px] transition-all relative",
                    activeTab === tab
                      ? "text-[var(--theme-text-primary)]"
                      : "text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]"
                  )}
                  style={{ fontWeight: activeTab === tab ? 600 : 500 }}
                >
                  {tab}
                  {activeTab === tab && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0A1D4D]"
                      style={{ borderRadius: "2px 2px 0 0" }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === "Personal Data" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[11px] text-[var(--theme-text-muted)] mb-2 block uppercase">
                      Birthday
                    </Label>
                    <Input
                      type="date"
                      value={formData.birthday}
                      onChange={(e) =>
                        setFormData({ ...formData, birthday: e.target.value })
                      }
                      className="border-[var(--theme-border-default)] text-[13px] h-10 rounded"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-[var(--theme-text-muted)] mb-2 block uppercase">
                      Contact No.
                    </Label>
                    <Input
                      value={formData.contactNo}
                      onChange={(e) =>
                        setFormData({ ...formData, contactNo: e.target.value })
                      }
                      placeholder="+63"
                      className="border-[var(--theme-border-default)] text-[13px] h-10 rounded"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-[var(--theme-text-muted)] mb-2 block uppercase">
                    Address
                  </Label>
                  <Input
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="Complete address"
                    className="border-[var(--theme-border-default)] text-[13px] h-10 rounded"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-[var(--theme-text-muted)] mb-2 block uppercase">
                    Emergency Contact
                  </Label>
                  <Input
                    value={formData.emergencyContact}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emergencyContact: e.target.value,
                      })
                    }
                    placeholder="Name and contact number"
                    className="border-[var(--theme-border-default)] text-[13px] h-10 rounded"
                  />
                </div>
              </div>
            )}

            {activeTab === "Employment Records" && (
              <div>
                <div className="border border-[var(--theme-border-default)] rounded-lg overflow-hidden mb-4">
                  <table className="w-full">
                    <thead className="bg-[var(--theme-bg-surface)]">
                      <tr>
                        <th
                          className="px-4 py-3 text-left text-[10px] text-[var(--theme-text-muted)] uppercase border-b border-[var(--theme-border-default)]"
                          style={{ fontWeight: 600 }}
                        >
                          Company
                        </th>
                        <th
                          className="px-4 py-3 text-left text-[10px] text-[var(--theme-text-muted)] uppercase border-b border-[var(--theme-border-default)]"
                          style={{ fontWeight: 600 }}
                        >
                          Date Hired
                        </th>
                        <th
                          className="px-4 py-3 text-left text-[10px] text-[var(--theme-text-muted)] uppercase border-b border-[var(--theme-border-default)]"
                          style={{ fontWeight: 600 }}
                        >
                          Rate Type
                        </th>
                        <th
                          className="px-4 py-3 text-right text-[10px] text-[var(--theme-text-muted)] uppercase border-b border-[var(--theme-border-default)]"
                          style={{ fontWeight: 600 }}
                        >
                          Rate
                        </th>
                        <th
                          className="px-4 py-3 text-left text-[10px] text-[var(--theme-text-muted)] uppercase border-b border-[var(--theme-border-default)]"
                          style={{ fontWeight: 600 }}
                        >
                          Status
                        </th>
                        <th
                          className="px-4 py-3 text-left text-[10px] text-[var(--theme-text-muted)] uppercase border-b border-[var(--theme-border-default)]"
                          style={{ fontWeight: 600 }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-[var(--theme-bg-surface)] divide-y divide-[var(--theme-border-default)]">
                      {employmentRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-[var(--theme-bg-page)]">
                          <td className="px-4 py-3 text-[12px] text-[var(--theme-text-primary)]">
                            {record.company}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[var(--theme-text-muted)]">
                            {record.dateHired}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[var(--theme-text-muted)]">
                            {record.rateType}
                          </td>
                          <td
                            className="px-4 py-3 text-[12px] text-[var(--theme-text-primary)] text-right"
                            style={{ fontWeight: 500 }}
                          >
                            ₱{record.rate.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "px-2 py-1 rounded-full text-[10px]",
                                record.status === "Active"
                                  ? "bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)]"
                                  : "bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)]"
                              )}
                              style={{ fontWeight: 600 }}
                            >
                              {record.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-page)]"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  variant="ghost"
                  className="text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-page)] h-9 text-[12px]"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Employment Record
                </Button>
              </div>
            )}

            {activeTab === "Documents" && (
              <div>
                <div className="space-y-2 mb-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-page)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-[#EDF0F7] flex items-center justify-center">
                          <FileText className="w-5 h-5 text-[var(--theme-text-primary)]" />
                        </div>
                        <div>
                          <p
                            className="text-[13px] text-[var(--theme-text-primary)]"
                            style={{ fontWeight: 500 }}
                          >
                            {doc.name}
                          </p>
                          <p className="text-[11px] text-[var(--theme-text-muted)]">
                            Uploaded {doc.uploadedDate}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[#0F5EFE] hover:bg-[#EFF6FF] text-[11px]"
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full h-10 rounded-lg border-[var(--theme-border-default)] text-[13px]"
                  style={{ fontWeight: 500 }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-[var(--theme-border-default)] px-6 py-4 flex items-center justify-end gap-2 flex-shrink-0 bg-[var(--theme-bg-surface)]">
          <Button
            onClick={onClose}
            variant="ghost"
            className="h-10 px-5 rounded-lg"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="h-10 px-5 rounded-lg bg-[#0A1D4D] hover:bg-[#0A1D4D]/90 text-white"
          >
            Save Employee
          </Button>
        </div>
      </div>
    </div>
  );
}
