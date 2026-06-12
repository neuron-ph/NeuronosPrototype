/**
 * Executive admin: Approval Routing.
 *
 * Plain-English surface over public.routing_rules (the routing/assignment engine,
 * migration 205). A rule reads as one sentence — "When a Forwarding expense comes
 * in, send it to the Pricing Manager." The engine/schema are unchanged; this is
 * purely the human-friendly presentation:
 *   A) sentence builder editor (fill-in-the-blank, jargon hidden under "More options")
 *   B) the list reads as sentences, with the default shown and drag-to-reorder (priority)
 *   C) template-first "Add" so there's never a blank canvas
 *
 * Reads are public (the EV resolver runs as the submitter); writes gated by
 * exec_profiling (RLS, migration 206). Domain is fixed to 'evoucher' for now.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { usePermission } from "../../../context/PermissionProvider";
import { toast } from "../../ui/toast-utils";
import { Input } from "../../ui/input";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { SidePanel } from "../../common/SidePanel";
import { DEPARTMENTS, ROLES } from "../userFormShared";

const DOMAIN = "evoucher";

type Authority = { department?: string | null; role?: string | null };
type RoutingRuleRow = {
  id: string;
  domain: string;
  label: string;
  trigger: Record<string, unknown>;
  authority: Authority;
  priority: number;
  active: boolean;
};
type AppUser = { id: string; name: string; role: string; department: string };

// ── Option catalogs (human-facing) ────────────────────────────────────────
const SERVICE_LINE_OPTIONS = [
  { value: "", label: "Any expense" },
  { value: "Forwarding", label: "Forwarding" },
  { value: "Brokerage", label: "Brokerage" },
  { value: "Trucking", label: "Trucking" },
  { value: "Marine Insurance", label: "Marine Insurance" },
  { value: "Others", label: "Others" },
];

const DEPT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));

// Curated approver roles (staff is never an approver); "" = anyone in the dept.
const APPROVER_ROLE_OPTIONS = [
  { value: "manager", label: "Manager" },
  { value: "supervisor", label: "Supervisor" },
  { value: "team_leader", label: "Team Leader" },
  { value: "executive", label: "Executive" },
  { value: "", label: "anyone" },
];

// Advanced (rarely needed) extra conditions, hidden under "More options".
type FieldKind = "txn" | "dept" | "bool";
const ADVANCED_FIELDS: { value: string; label: string; kind: FieldKind }[] = [
  { value: "transaction_type", label: "Request type", kind: "txn" },
  { value: "requestor_department", label: "Requester's department", kind: "dept" },
  { value: "is_billable", label: "Is billable", kind: "bool" },
  { value: "has_booking", label: "Has a linked booking", kind: "bool" },
];
const TXN_TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "cash_advance", label: "Cash advance" },
  { value: "reimbursement", label: "Reimbursement" },
  { value: "budget_request", label: "Budget request" },
  { value: "direct_expense", label: "Direct expense" },
];
const BOOL_OPTIONS = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];

const advField = (f: string) => ADVANCED_FIELDS.find((a) => a.value === f);
const advValueOptions = (f: string) => {
  switch (advField(f)?.kind) {
    case "txn": return TXN_TYPE_OPTIONS;
    case "dept": return DEPT_OPTIONS;
    case "bool": return BOOL_OPTIONS;
    default: return [];
  }
};
const roleLabel = (role?: string | null) =>
  ROLES.find((r) => r.value === role)?.label ?? (role || "");

// "Pricing Manager" / "Pricing (anyone)"
const deptRoleLabel = (a: Authority) =>
  a?.role ? `${a.department} ${roleLabel(a.role)}` : `${a?.department ?? ""} (anyone)`;

// ── Form model ─────────────────────────────────────────────────────────────
type Condition = { field: string; value: string };
type FormState = {
  id?: string;
  serviceLine: string;
  department: string;
  role: string;
  advanced: Condition[];
  active: boolean;
  customLabel: string;
  priority: number;
};

const serviceTemplate = (): FormState => ({
  serviceLine: "Forwarding",
  department: "Pricing",
  role: "manager",
  advanced: [],
  active: true,
  customLabel: "",
  priority: 100,
});

const TEMPLATES: { key: string; label: string; hint: string; make: () => FormState }[] = [
  {
    key: "service",
    label: "A service line's expenses → an approver",
    hint: "e.g. Forwarding expenses go to the Pricing Manager",
    make: serviceTemplate,
  },
  {
    key: "reqtype",
    label: "A request type → an approver",
    hint: "e.g. Reimbursements go to the Accounting Manager",
    make: () => ({
      serviceLine: "",
      department: "Accounting",
      role: "manager",
      advanced: [{ field: "transaction_type", value: "reimbursement" }],
      active: true,
      customLabel: "",
      priority: 100,
    }),
  },
  {
    key: "blank",
    label: "Start from scratch",
    hint: "Build the rule yourself",
    make: () => ({
      serviceLine: "",
      department: "",
      role: "manager",
      advanced: [],
      active: true,
      customLabel: "",
      priority: 100,
    }),
  },
];

function rowToForm(row: RoutingRuleRow): FormState {
  const trigger = row.trigger || {};
  const advanced: Condition[] = Object.entries(trigger)
    .filter(([k]) => k !== "booking_service_type")
    .map(([field, value]) => ({
      field,
      value: typeof value === "boolean" ? String(value) : String(value ?? ""),
    }));
  return {
    id: row.id,
    serviceLine: String(trigger.booking_service_type ?? ""),
    department: row.authority?.department ?? "",
    role: row.authority?.role ?? "",
    advanced,
    active: row.active,
    customLabel: "",
    priority: row.priority ?? 100,
  };
}

function buildTrigger(form: FormState): Record<string, unknown> {
  const trigger: Record<string, unknown> = {};
  if (form.serviceLine) trigger.booking_service_type = form.serviceLine;
  for (const c of form.advanced) {
    if (!c.field || c.value === "") continue;
    trigger[c.field] = advField(c.field)?.kind === "bool" ? c.value === "true" : c.value;
  }
  return trigger;
}

function autoLabel(form: FormState): string {
  const what = form.serviceLine ? `${form.serviceLine} expenses` : "All expenses";
  const who = form.role ? `${form.department} ${roleLabel(form.role)}` : `${form.department} (anyone)`;
  return `${what} → ${who}`;
}

const resolveHolders = (a: Authority, users: AppUser[]) =>
  users.filter((u) => u.department === a.department && (!a.role || u.role === a.role));

const QUERY_KEY = ["admin", "routing-rules"];

export function RoutingRulesTab() {
  const { can } = usePermission();
  const canEdit = can("exec_profiling", "edit");
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<FormState>(serviceTemplate());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ordered, setOrdered] = useState<RoutingRuleRow[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: rules = [] } = useQuery<RoutingRuleRow[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routing_rules")
        .select("id, domain, label, trigger, authority, priority, active")
        .eq("domain", DOMAIN)
        .order("priority");
      if (error) throw error;
      return (data ?? []) as RoutingRuleRow[];
    },
  });

  const { data: users = [] } = useQuery<AppUser[]>({
    queryKey: ["admin", "routing-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, role, department")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as AppUser[];
    },
  });

  useEffect(() => setOrdered(rules), [rules]);

  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const isNew = !form.id;

  const openCreate = () => {
    setForm(serviceTemplate());
    setShowAdvanced(false);
    setConfirmDelete(false);
    setPanelOpen(true);
  };
  const openEdit = (row: RoutingRuleRow) => {
    const f = rowToForm(row);
    setForm(f);
    setShowAdvanced(f.advanced.length > 0);
    setConfirmDelete(false);
    setPanelOpen(true);
  };

  const toggleActive = async (row: RoutingRuleRow) => {
    if (!canEdit) return;
    const { error } = await supabase
      .from("routing_rules")
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return toast.error(`Couldn't update. ${error.message}`);
    refresh();
  };

  const save = async () => {
    if (!form.department) return toast.error("Choose who should approve it.");
    setSaving(true);
    const nextPriority = isNew
      ? (ordered.reduce((m, r) => Math.max(m, r.priority), 0) || 0) + 10
      : form.priority;
    const payload = {
      domain: DOMAIN,
      label: form.customLabel.trim() || autoLabel(form),
      trigger: buildTrigger(form),
      authority: form.role ? { department: form.department, role: form.role } : { department: form.department },
      priority: nextPriority,
      active: form.active,
      updated_at: new Date().toISOString(),
    };
    const res = form.id
      ? await supabase.from("routing_rules").update(payload).eq("id", form.id)
      : await supabase.from("routing_rules").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(`Couldn't save. ${res.error.message}`);
    toast.success(form.id ? "Rule saved" : "Rule added");
    setPanelOpen(false);
    refresh();
  };

  const remove = async () => {
    if (!form.id) return;
    const { error } = await supabase.from("routing_rules").delete().eq("id", form.id);
    if (error) return toast.error(`Couldn't delete. ${error.message}`);
    toast.success("Rule removed");
    setPanelOpen(false);
    refresh();
  };

  // Drag-to-reorder → rewrites priority (10, 20, 30…). Hidden as a concept.
  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return setDragId(null);
    const from = ordered.findIndex((r) => r.id === dragId);
    const to = ordered.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) return setDragId(null);
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrdered(next);
    setDragId(null);
    await Promise.all(
      next.map((r, i) =>
        supabase.from("routing_rules").update({ priority: (i + 1) * 10 }).eq("id", r.id),
      ),
    );
    refresh();
  };

  const holderText = (a: Authority) => {
    const holders = resolveHolders(a, users);
    const label = deptRoleLabel(a);
    if (holders.length === 0) return { name: `${label}`, sub: "no one assigned yet", warn: true };
    const extra = holders.length > 1 ? ` +${holders.length - 1}` : "";
    return { name: `${holders[0].name}${extra}`, sub: label, warn: false };
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-[18px] font-semibold text-[var(--theme-text-primary)]">Approval Routing</h2>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
            Decide who approves what. Rules are checked top to bottom — the first match wins.
            {!canEdit ? " (Read-only — Executive permissions required.)" : ""}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white"
            style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
          >
            <Plus size={16} /> Add a rule
          </button>
        )}
      </div>

      <div className="space-y-2">
        {ordered.map((r) => {
          const h = holderText(r.authority);
          const what = r.trigger?.booking_service_type
            ? `${r.trigger.booking_service_type} expenses`
            : "All expenses";
          const extraConds = Object.keys(r.trigger || {}).filter((k) => k !== "booking_service_type").length;
          return (
            <div
              key={r.id}
              draggable={canEdit && ordered.length > 1}
              onDragStart={() => setDragId(r.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(r.id)}
              onClick={() => canEdit && openEdit(r)}
              className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${
                canEdit ? "cursor-pointer hover:border-[var(--theme-action-primary-bg)]" : ""
              }`}
              style={{
                borderColor: "var(--theme-border-default)",
                backgroundColor: "var(--theme-bg-surface)",
                opacity: r.active ? 1 : 0.55,
              }}
            >
              {canEdit && ordered.length > 1 && (
                <GripVertical
                  size={16}
                  className="text-[var(--theme-text-muted)] opacity-0 group-hover:opacity-60 shrink-0"
                  style={{ cursor: "grab" }}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-[14px] text-[var(--theme-text-primary)]">
                  <span className="font-semibold">{what}</span>
                  {extraConds > 0 && (
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" }}
                    >
                      +{extraConds} more
                    </span>
                  )}
                  <ArrowRight size={14} className="text-[var(--theme-text-muted)]" />
                  <span style={{ color: h.warn ? "var(--theme-status-danger-fg)" : "var(--theme-text-primary)" }}>
                    approved by <span className="font-semibold">{h.name}</span>
                    <span className="text-[var(--theme-text-muted)]"> · {h.sub}</span>
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleActive(r);
                }}
                disabled={!canEdit}
                className="shrink-0 relative w-10 h-6 rounded-full transition-colors"
                style={{ backgroundColor: r.active ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)" }}
                title={r.active ? "On" : "Off"}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: r.active ? "18px" : "2px" }}
                />
              </button>
            </div>
          );
        })}

        {/* The default — always shown so the system is never a black box */}
        <div
          className="flex items-center gap-2 px-4 py-3.5 rounded-xl border border-dashed text-[14px]"
          style={{ borderColor: "var(--theme-border-default)", color: "var(--theme-text-muted)" }}
        >
          <span className="font-semibold text-[var(--theme-text-primary)]">Everything else</span>
          <ArrowRight size={14} />
          <span>approved by the requester&apos;s own manager</span>
          <span className="ml-1 text-[11px] uppercase tracking-[0.04em]">default</span>
        </div>
      </div>

      {/* ── Editor: the rule as a sentence ── */}
      <SidePanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={isNew ? "Add a rule" : "Edit rule"}
        size="md"
        footer={
          <div className="px-10 py-5 border-t border-[var(--theme-border-default)] flex items-center justify-between">
            <div>
              {!isNew &&
                (confirmDelete ? (
                  <span className="flex items-center gap-2 text-[12px]">
                    <span className="text-[var(--theme-text-muted)]">Remove this rule?</span>
                    <button onClick={remove} className="font-semibold text-[var(--theme-status-danger-fg)]">Yes, remove</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-[var(--theme-text-muted)]">Cancel</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 text-[12px] text-[var(--theme-text-muted)] hover:text-[var(--theme-status-danger-fg)]"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPanelOpen(false)} className="px-3 py-2 rounded-lg text-[13px] text-[var(--theme-text-muted)]">Cancel</button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
              >
                {saving ? "Saving…" : isNew ? "Add rule" : "Save"}
              </button>
            </div>
          </div>
        }
      >
        <div className="px-10 py-7 overflow-y-auto h-full">
          {/* C) Templates — only when adding */}
          {isNew && (
            <div className="mb-7">
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] mb-2 text-[var(--theme-text-muted)]">
                Start with
              </div>
              <div className="space-y-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      const f = t.make();
                      setForm(f);
                      setShowAdvanced(f.advanced.length > 0);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:border-[var(--theme-action-primary-bg)]"
                    style={{ borderColor: "var(--theme-border-default)" }}
                  >
                    <div className="text-[13px] font-semibold text-[var(--theme-text-primary)]">{t.label}</div>
                    <div className="text-[12px] text-[var(--theme-text-muted)]">{t.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* A) The sentence */}
          <div className="text-[16px] leading-[2.4] text-[var(--theme-text-primary)]">
            When a{" "}
            <InlinePicker
              value={form.serviceLine}
              options={SERVICE_LINE_OPTIONS}
              onChange={(v) => setForm((f) => ({ ...f, serviceLine: v }))}
            />{" "}
            comes in, send it to the{" "}
            <InlinePicker
              value={form.department}
              options={DEPT_OPTIONS}
              placeholder="department"
              onChange={(v) => setForm((f) => ({ ...f, department: v }))}
            />{" "}
            <InlinePicker
              value={form.role}
              options={APPROVER_ROLE_OPTIONS}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
            />{" "}
            for approval.
          </div>

          {/* Live "who is that right now" */}
          {form.department && (
            <div className="mt-3 text-[12px] text-[var(--theme-text-muted)]">
              {(() => {
                const holders = resolveHolders({ department: form.department, role: form.role }, users);
                if (holders.length === 0)
                  return <span style={{ color: "var(--theme-status-danger-fg)" }}>⚠ No one currently holds this role.</span>;
                return <>Right now that’s <span className="font-semibold text-[var(--theme-text-primary)]">{holders.map((h) => h.name).join(", ")}</span>.</>;
              })()}
            </div>
          )}

          {/* More options (advanced conditions + custom name) */}
          <button
            onClick={() => setShowAdvanced((s) => !s)}
            className="mt-7 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--theme-text-muted)]"
          >
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} More options
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 pl-1">
              <div>
                <div className="text-[12px] font-semibold mb-1.5 text-[var(--theme-text-primary)]">Only apply when…</div>
                <div className="space-y-2">
                  {form.advanced.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1">
                        <CustomDropdown
                          value={c.field}
                          options={ADVANCED_FIELDS}
                          onChange={(v) =>
                            setForm((f) => {
                              const advanced = [...f.advanced];
                              advanced[i] = { field: v, value: advValueOptions(v)[0]?.value ?? "" };
                              return { ...f, advanced };
                            })
                          }
                          fullWidth
                          size="sm"
                        />
                      </div>
                      <div className="flex-1">
                        <CustomDropdown
                          value={c.value}
                          options={advValueOptions(c.field)}
                          onChange={(v) =>
                            setForm((f) => {
                              const advanced = [...f.advanced];
                              advanced[i] = { ...advanced[i], value: v };
                              return { ...f, advanced };
                            })
                          }
                          fullWidth
                          size="sm"
                        />
                      </div>
                      <button
                        onClick={() => setForm((f) => ({ ...f, advanced: f.advanced.filter((_, j) => j !== i) }))}
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-surface-subtle)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setForm((f) => ({ ...f, advanced: [...f.advanced, { field: "transaction_type", value: "expense" }] }))}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--theme-action-primary-bg)]"
                  >
                    <Plus size={14} /> Add a condition
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold mb-1.5 text-[var(--theme-text-primary)]">
                  Custom name <span className="font-normal text-[var(--theme-text-muted)]">(optional)</span>
                </label>
                <Input
                  value={form.customLabel}
                  onChange={(e) => setForm((f) => ({ ...f, customLabel: e.target.value }))}
                  placeholder={autoLabel(form)}
                />
              </div>
            </div>
          )}
        </div>
      </SidePanel>
    </div>
  );
}

/** A dropdown that renders inline inside a sentence, styled as an editable chip. */
function InlinePicker({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <span className="inline-block align-middle">
      <CustomDropdown
        value={value}
        options={options}
        onChange={onChange}
        placeholder={placeholder}
        size="sm"
        buttonStyle={{
          display: "inline-flex",
          borderRadius: 8,
          backgroundColor: "var(--theme-bg-surface-subtle)",
          borderColor: "var(--theme-action-primary-bg)",
          fontWeight: 600,
        }}
      />
    </span>
  );
}
