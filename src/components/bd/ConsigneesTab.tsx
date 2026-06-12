import { useState } from "react";
import { Plus, Edit, Trash2, X, Building2, User, Phone, Mail, FileText, MapPin } from "lucide-react";
import type { Consignee } from "../../types/bd";
import { useConsignees } from "../../hooks/useConsignees";
import { toast } from "../ui/toast-utils";

interface ConsigneesTabProps {
  customerId: string;
}

interface ConsigneeFormData {
  name: string;
  address: string;
  tin: string;
  contact_person: string;
  email: string;
  phone: string;
}

const emptyForm: ConsigneeFormData = {
  name: "",
  address: "",
  tin: "",
  contact_person: "",
  email: "",
  phone: "",
};

export function ConsigneesTab({ customerId }: ConsigneesTabProps) {
  const { consignees, isLoading, createConsignee, updateConsignee, deleteConsignee } = useConsignees(customerId);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ConsigneeFormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openAddForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setIsFormOpen(true);
  };

  const openEditForm = (consignee: Consignee) => {
    setFormData({
      name: consignee.name || "",
      address: consignee.address || "",
      tin: consignee.tin || "",
      contact_person: consignee.contact_person || "",
      email: consignee.email || "",
      phone: consignee.phone || "",
    });
    setEditingId(consignee.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Consignee name is required");
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateConsignee(editingId, formData);
        toast.success("Consignee updated");
      } else {
        await createConsignee(formData);
        toast.success("Consignee added");
      }
      closeForm();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteConsignee(id);
      toast.success("Consignee deleted");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeletingId(null);
    }
  };

  const updateField = (field: keyof ConsigneeFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
          Consignees / Shippers
        </h3>
        <button
          onClick={openAddForm}
          className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2"
          style={{ backgroundColor: "var(--theme-action-primary-bg)", color: "#FFFFFF" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)"; }}
        >
          <Plus className="w-4 h-4" />
          Add Consignee/Shipper
        </button>
      </div>

      {/* Inline Form */}
      {isFormOpen && (
        <div
          className="mb-6 rounded-lg p-5"
          style={{ border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-page)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
              {editingId ? "Edit Consignee/Shipper" : "New Consignee/Shipper"}
            </h4>
            <button onClick={closeForm} className="p-1 rounded hover:bg-[var(--theme-bg-surface-tint)] transition-colors">
              <X className="w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                Consignee/Shipper Name *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g., Tomoro Coffee Philippines"
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg text-[13px] outline-none transition-all"
                  style={{ border: "1px solid var(--theme-border-default)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
                />
              </div>
            </div>

            {/* TIN */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                TIN
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
                <input
                  type="text"
                  value={formData.tin}
                  onChange={(e) => updateField("tin", e.target.value)}
                  placeholder="e.g., 123-456-789-000"
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg text-[13px] outline-none transition-all"
                  style={{ border: "1px solid var(--theme-border-default)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
                />
              </div>
            </div>

            {/* Address — full width */}
            <div className="col-span-2">
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                Address
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="e.g., 123 Industrial Blvd, Quezon City"
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg text-[13px] outline-none transition-all"
                  style={{ border: "1px solid var(--theme-border-default)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
                />
              </div>
            </div>

            {/* Contact Person */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                Contact Person
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => updateField("contact_person", e.target.value)}
                  placeholder="e.g., Juan Dela Cruz"
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg text-[13px] outline-none transition-all"
                  style={{ border: "1px solid var(--theme-border-default)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="e.g., juan@tomoro.com"
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg text-[13px] outline-none transition-all"
                  style={{ border: "1px solid var(--theme-border-default)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--theme-text-muted)" }} />
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="e.g., +63 917 123 4567"
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg text-[13px] outline-none transition-all"
                  style={{ border: "1px solid var(--theme-border-default)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-5 pt-4" style={{ borderTop: "1px solid var(--theme-border-default)" }}>
            <button
              onClick={closeForm}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
              style={{ border: "1px solid var(--theme-border-default)", color: "var(--theme-text-muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !formData.name.trim()}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--theme-action-primary-bg)", color: "#FFFFFF" }}
              onMouseEnter={(e) => { if (!isSaving) e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)"; }}
            >
              {isSaving ? "Saving..." : editingId ? "Update" : "Add Consignee/Shipper"}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12">
          <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>Loading consignees...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && consignees.length === 0 && !isFormOpen && (
        <div className="text-center py-16 rounded-lg" style={{ border: "1px dashed var(--theme-border-default)" }}>
          <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--neuron-ui-muted)" }} />
          <p className="text-[14px] mb-1" style={{ color: "var(--theme-text-muted)" }}>
            No consignees / shippers yet
          </p>
          <p className="text-[12px] mb-4" style={{ color: "var(--theme-text-muted)" }}>
            Add the receivers/importers this customer ships to
          </p>
          <button
            onClick={openAddForm}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
            style={{ backgroundColor: "var(--theme-action-primary-bg)", color: "#FFFFFF" }}
          >
            Add First Consignee/Shipper
          </button>
        </div>
      )}

      {/* Consignees Table */}
      {!isLoading && consignees.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--theme-border-default)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "var(--theme-bg-page)" }}>
                <th className="text-left px-4 py-3 text-[12px] font-medium" style={{ color: "var(--theme-text-muted)", borderBottom: "1px solid var(--theme-border-default)" }}>
                  Name
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium" style={{ color: "var(--theme-text-muted)", borderBottom: "1px solid var(--theme-border-default)" }}>
                  Address
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium" style={{ color: "var(--theme-text-muted)", borderBottom: "1px solid var(--theme-border-default)" }}>
                  TIN
                </th>
                <th className="text-left px-4 py-3 text-[12px] font-medium" style={{ color: "var(--theme-text-muted)", borderBottom: "1px solid var(--theme-border-default)" }}>
                  Contact Person
                </th>
                <th className="text-right px-4 py-3 text-[12px] font-medium" style={{ color: "var(--theme-text-muted)", borderBottom: "1px solid var(--theme-border-default)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {consignees.map((csg) => (
                <tr
                  key={csg.id}
                  className="hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                  style={{ borderBottom: "1px solid var(--theme-border-default)" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 shrink-0" style={{ color: "var(--theme-action-primary-bg)" }} />
                      <span className="text-[13px] font-medium" style={{ color: "var(--theme-text-primary)" }}>
                        {csg.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                      {csg.address || "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                      {csg.tin || "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                      {csg.contact_person || "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditForm(csg)}
                        className="p-1.5 rounded hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} />
                      </button>
                      <button
                        onClick={() => handleDelete(csg.id)}
                        disabled={deletingId === csg.id}
                        className="p-1.5 rounded hover:bg-[var(--theme-status-danger-bg)] transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" style={{ color: deletingId === csg.id ? "var(--theme-text-muted)" : "var(--theme-status-danger-fg)" }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
