import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { CustomDropdown } from "./CustomDropdown";
import { generateRoleKey } from "../../utils/teamProfileMapping";
import type { TeamProfileAssignment } from "../../types/bd";

interface UserOption {
  id: string;
  name: string;
  role: string;
  department: string;
}

interface DepartmentTeamEditorProps {
  department: string;
  assignments: TeamProfileAssignment[];
  onChange: (assignments: TeamProfileAssignment[]) => void;
}

// Predefined role suggestions per department
const ROLE_SUGGESTIONS: Record<string, { key: string; label: string }[]> = {
  Operations: [
    { key: "manager", label: "Manager" },
    { key: "supervisor", label: "Supervisor" },
    { key: "handler", label: "Handler" },
  ],
  Pricing: [{ key: "pricing_analyst", label: "Pricing Analyst" }],
  "Business Development": [{ key: "account_rep", label: "Account Rep" }],
  Accounting: [{ key: "ar_handler", label: "AR Handler" }],
  HR: [{ key: "hr_contact", label: "HR Contact" }],
};

export function DepartmentTeamEditor({
  department,
  assignments,
  onChange,
}: DepartmentTeamEditorProps) {
  const [rows, setRows] = useState<TeamProfileAssignment[]>(
    assignments.length > 0 ? assignments : [{ role_key: "", role_label: "", user_id: "", user_name: "" }]
  );
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    supabase
      .from("users")
      .select("id, name, role, department")
      .eq("department", department)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setUsers(data ?? []));
  }, [department]);

  const suggestions = ROLE_SUGGESTIONS[department] ?? [];
  const userOptions = [
    { value: "", label: "Select person..." },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];

  const updateRow = (index: number, patch: Partial<TeamProfileAssignment>) => {
    const updated = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRows(updated);
    const valid = updated.filter((r) => r.role_key && r.user_id);
    onChange(valid);
  };

  const addRow = () => {
    const nextSuggestion = suggestions.find(
      (s) => !rows.some((r) => r.role_key === s.key)
    );
    setRows([
      ...rows,
      {
        role_key: nextSuggestion?.key ?? "",
        role_label: nextSuggestion?.label ?? "",
        user_id: "",
        user_name: "",
      },
    ]);
  };

  const removeRow = (index: number) => {
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated.length > 0 ? updated : [{ role_key: "", role_label: "", user_id: "", user_name: "" }]);
    const valid = updated.filter((r) => r.role_key && r.user_id);
    onChange(valid);
  };

  const handleRoleLabelChange = (index: number, label: string) => {
    const suggestion = suggestions.find((s) => s.label === label);
    const key = suggestion ? suggestion.key : generateRoleKey(label);
    updateRow(index, { role_label: label, role_key: key });
  };

  const handleUserChange = (index: number, userId: string) => {
    const user = users.find((u) => u.id === userId);
    updateRow(index, { user_id: userId, user_name: user?.name ?? "" });
  };

  const roleOptions =
    suggestions.length > 0
      ? [{ value: "", label: "Select role..." }, ...suggestions.map((s) => ({ value: s.label, label: s.label }))]
      : null;

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          {/* Role */}
          <div style={{ flex: "0 0 180px" }}>
            {roleOptions ? (
              <CustomDropdown
                label={index === 0 ? "Role" : undefined}
                value={row.role_label}
                options={roleOptions}
                onChange={(val) => handleRoleLabelChange(index, val)}
                fullWidth
              />
            ) : (
              <div>
                {index === 0 && (
                  <label
                    className="block text-[11px] font-medium uppercase tracking-wide mb-1.5"
                    style={{ color: "var(--neuron-ink-muted)" }}
                  >
                    Role
                  </label>
                )}
                <input
                  type="text"
                  value={row.role_label}
                  onChange={(e) => handleRoleLabelChange(index, e.target.value)}
                  placeholder="e.g. Account Rep"
                  className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
                  style={{
                    border: "1px solid var(--neuron-ui-border)",
                    backgroundColor: "var(--theme-bg-surface)",
                    color: "var(--neuron-ink-primary)",
                  }}
                />
              </div>
            )}
          </div>

          {/* Person */}
          <div style={{ flex: 1 }}>
            <CustomDropdown
              label={index === 0 ? "Assigned To" : undefined}
              value={row.user_id}
              options={userOptions}
              onChange={(val) => handleUserChange(index, val)}
              fullWidth
            />
          </div>

          {/* Remove */}
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="mb-0.5 p-1.5 rounded hover:bg-red-50 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-[12px] font-medium transition-colors"
        style={{ color: "var(--theme-action-primary-bg)" }}
      >
        <Plus size={14} />
        Add person
      </button>
    </div>
  );
}
