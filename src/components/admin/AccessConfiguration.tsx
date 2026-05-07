import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { ArrowLeft, Save, AlertTriangle, RotateCcw, BookMarked, ChevronDown, BookOpen, Check } from "lucide-react";
import { useUser } from "../../hooks/useUser";
import { PermissionGrantEditor } from "./accessProfiles/PermissionGrantEditor";
import type { ModuleGrants, AccessProfileSummary } from "./accessProfiles/accessProfileTypes";
import { cloneGrants, hasGrantOverrides, normalizeProfileName, shouldClearAppliedProfile } from "./accessProfiles/accessGrantUtils";
import { NeuronModal } from "../ui/NeuronModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfigUser {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

interface AccessConfigurationProps {
  user: ConfigUser;
  onBack: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  staff:       "Staff",
  team_leader: "Team Leader",
  supervisor:  "Supervisor",
  manager:     "Manager",
  executive:   "Executive",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  executive:   { bg: "color-mix(in oklch, var(--neuron-ink-primary) 12%, transparent)", text: "var(--neuron-ink-primary)" },
  manager:     { bg: "var(--neuron-status-accent-bg)",    text: "var(--neuron-status-accent-fg)" },
  supervisor:  { bg: "var(--neuron-semantic-info-bg)",    text: "var(--neuron-semantic-info)" },
  team_leader: { bg: "var(--theme-status-warning-bg)",    text: "var(--theme-status-warning-fg)" },
  staff:       { bg: "var(--neuron-bg-surface-subtle)",   text: "var(--theme-text-secondary)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Save as Profile inline form ─────────────────────────────────────────────

function SaveAsProfileForm({
  grants,
  onSaved,
  onClose,
}: {
  grants: ModuleGrants;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmed = normalizeProfileName(name);
    if (!trimmed) { setError("Name is required"); return; }
    setSaving(true);
    const { error: dbError } = await supabase.from("access_profiles").insert({
      name: trimmed,
      module_grants: grants,
      created_by: currentUser?.id ?? null,
      updated_by: currentUser?.id ?? null,
    });
    setSaving(false);
    if (dbError) {
      if (dbError.code === "23505") setError("A profile with this name already exists");
      else toast.error("Failed to create profile");
      return;
    }
    try {
      await (supabase as any).from("permission_audit_log").insert({
        changed_by: currentUser?.name || currentUser?.email || "unknown",
        changes: { action: "access_profile_saved_from_user", profile_name: trimmed, changed_keys: Object.keys(grants) },
      });
    } catch { console.warn("[AccessConfiguration] audit log failed") }
    queryClient.invalidateQueries({ queryKey: ["access_profiles"] });
    toast.success(`Profile "${trimmed}" created`);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 1000, width: 280, backgroundColor: "var(--neuron-bg-elevated)", borderRadius: 10, border: "1px solid var(--neuron-ui-border)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: "0 0 10px" }}>Save as Profile</p>
      <input
        type="text"
        value={name}
        onChange={e => { setName(e.target.value); setError(""); }}
        placeholder="Profile name, e.g. BD Manager"
        autoFocus
        style={{ width: "100%", padding: "7px 10px", borderRadius: 7, fontSize: 13, border: `1px solid ${error ? "var(--neuron-semantic-error, #dc2626)" : "var(--neuron-ui-border)"}`, background: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", outline: "none", boxSizing: "border-box" }}
        onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
      />
      {error && <span style={{ fontSize: 11, color: "var(--neuron-semantic-error, #dc2626)", display: "block", marginTop: 4 }}>{error}</span>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
        <button onClick={onClose} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid var(--neuron-ui-border)", background: "transparent", fontSize: 12, cursor: "pointer", color: "var(--neuron-ink-muted)" }}>Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "var(--neuron-action-primary)", color: "var(--neuron-action-primary-text)", fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Create"}
        </button>
      </div>
    </div>
  );
}

// ─── AccessConfiguration ──────────────────────────────────────────────────────

export function AccessConfiguration({ user, onBack }: AccessConfigurationProps) {
  const { user: currentAdmin } = useUser();
  const queryClient = useQueryClient();
  const applyProfileBtnRef = useRef<HTMLDivElement>(null);

  const [overrides, setOverrides] = useState<ModuleGrants>({});
  const [savedOverrides, setSavedOverrides] = useState<ModuleGrants>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ by: string; at: Date } | null>(null);

  // Profile state
  const [appliedProfileId, setAppliedProfileId] = useState<string | null>(null);
  const [appliedProfileName, setAppliedProfileName] = useState<string | null>(null);
  const [changedAfterProfileApply, setChangedAfterProfileApply] = useState(false);
  const [showApplyProfileMenu, setShowApplyProfileMenu] = useState(false);
  const [showSaveAsProfile, setShowSaveAsProfile] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Query active profiles for Apply Profile dropdown
  const { data: profiles = [] } = useQuery<AccessProfileSummary[]>({
    queryKey: ["access_profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("access_profiles")
        .select("id, name, description, target_department, target_role, module_grants, updated_at")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as AccessProfileSummary[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("permission_overrides")
        .select("module_grants, applied_profile_id, profile:applied_profile_id(id, name)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        const grants = (data?.module_grants ?? {}) as ModuleGrants;
        setOverrides(grants);
        setSavedOverrides(grants);
        const pid = (data as any)?.applied_profile_id ?? null;
        const pname = (data as any)?.profile?.name ?? null;
        setAppliedProfileId(pid);
        setAppliedProfileName(pname);
        setChangedAfterProfileApply(false);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const isDirty = useMemo(() => {
    const ok = Object.keys(overrides);
    const sk = Object.keys(savedOverrides);
    if (ok.length !== sk.length) return true;
    return ok.some(k => overrides[k] !== savedOverrides[k]);
  }, [overrides, savedOverrides]);

  // Show badge only when a profile is applied and user hasn't manually changed anything
  const showProfileBadge = !!(appliedProfileId && appliedProfileName && !changedAfterProfileApply);

  const handleGrantChange = (nextGrants: ModuleGrants) => {
    if (appliedProfileId && !changedAfterProfileApply) {
      setChangedAfterProfileApply(true);
    }
    setOverrides(nextGrants);
  };

  const handleReset = () => {
    setOverrides({ ...savedOverrides });
    setChangedAfterProfileApply(false);
  };

  const handleApplyProfile = (profile: AccessProfileSummary) => {
    setOverrides(cloneGrants(profile.module_grants));
    setAppliedProfileId(profile.id);
    setAppliedProfileName(profile.name);
    setChangedAfterProfileApply(false);
    setShowApplyProfileMenu(false);
    toast.success(`Profile "${profile.name}" applied — save to confirm`);
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: existing } = await supabase
      .from("permission_overrides")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const nextAppliedProfileId = shouldClearAppliedProfile(appliedProfileId, changedAfterProfileApply)
      ? null
      : appliedProfileId;

    let error: any;
    if (existing) {
      ({ error } = await supabase
        .from("permission_overrides")
        .update({ module_grants: overrides, applied_profile_id: nextAppliedProfileId })
        .eq("user_id", user.id));
    } else {
      ({ error } = await supabase
        .from("permission_overrides")
        .insert({ user_id: user.id, scope: "department_wide", module_grants: overrides, applied_profile_id: nextAppliedProfileId }));
    }

    setSaving(false);
    if (error) {
      toast.error("Failed to save access rules");
      return;
    }

    const saved = { ...overrides };
    setSavedOverrides(saved);
    setLastSaved({ by: currentAdmin?.name || "you", at: new Date() });

    // If manual edit cleared the profile, audit it
    if (appliedProfileId && changedAfterProfileApply) {
      try {
        await (supabase as any).from("permission_audit_log").insert({
          target_user_id: user.id,
          changed_by: currentAdmin?.name || currentAdmin?.email || "unknown",
          changes: { action: "access_profile_detached_by_manual_edit", previous_profile_id: appliedProfileId, previous_profile_name: appliedProfileName },
        });
      } catch { console.warn("[AccessConfiguration] audit log failed") }
      setAppliedProfileId(null);
      setAppliedProfileName(null);
    }
    setChangedAfterProfileApply(false);

    toast.success("Access rules saved");

    queryClient.invalidateQueries({ queryKey: ["permission_overrides"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "module_grants", user.id] });

    try {
      const added = Object.keys(overrides).filter(k => !(k in savedOverrides) || overrides[k] !== savedOverrides[k]);
      const removed = Object.keys(savedOverrides).filter(k => !(k in overrides));
      await (supabase as any).from("permission_audit_log").insert({
        target_user_id: user.id,
        changed_by: currentAdmin?.name || currentAdmin?.email || "unknown",
        changes: { added, removed },
      });
    } catch { /* silent */ }
  };

  // Close apply menu on outside click
  useEffect(() => {
    if (!showApplyProfileMenu) return;
    const handler = (e: MouseEvent) => {
      if (applyProfileBtnRef.current && !applyProfileBtnRef.current.contains(e.target as Node)) {
        setShowApplyProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showApplyProfileMenu]);

  const rc = ROLE_COLORS[user.role] ?? ROLE_COLORS.staff;
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--neuron-bg-elevated)" }}>

      {/* Top bar */}
      <div style={{
        padding: "12px 40px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        display: "flex", alignItems: "center",
        flexShrink: 0,
        backgroundColor: "var(--neuron-bg-elevated)",
      }}>
        <button
          onClick={() => isDirty ? setConfirmLeave(true) : onBack()}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid var(--neuron-ui-border)",
            background: "transparent", color: "var(--neuron-ink-muted)",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
            transition: "color 0.12s, border-color 0.12s", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--neuron-ink-primary)"; e.currentTarget.style.borderColor = "var(--neuron-ink-muted)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--neuron-ink-muted)"; e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
        >
          <ArrowLeft size={13} /> Users
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 40px 48px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>

          {/* Page heading */}
          {!loading && (
            <div style={{ padding: "24px 0 20px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "-0.3px", margin: 0, marginBottom: 3 }}>
                  Access Configuration
                </h2>
                <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0 }}>
                  Access rules for <strong style={{ fontWeight: 600, color: "var(--neuron-ink-secondary, var(--neuron-ink-primary))" }}>{user.name}</strong>.
                  A teal dot beneath a cell means it differs from the role baseline.
                </p>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                {[
                  {
                    indicator: (
                      <div style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: "var(--neuron-action-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={12} strokeWidth={3} color="#fff" />
                      </div>
                    ),
                    label: "Enabled",
                  },
                  {
                    indicator: (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: "var(--neuron-action-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check size={12} strokeWidth={3} color="#fff" />
                        </div>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "var(--neuron-action-primary)" }} />
                      </div>
                    ),
                    label: "Override",
                  },
                  {
                    indicator: (
                      <div style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: "transparent", border: "1.25px solid color-mix(in oklch, var(--neuron-ui-border) 70%, transparent)" }} />
                    ),
                    label: "Disabled",
                  },
                  {
                    indicator: <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)", opacity: 0.4, minWidth: 18, textAlign: "center" as const, cursor: "not-allowed" }}>—</span>,
                    label: "N/A",
                  },
                ].map(({ indicator, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {indicator}
                    <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profile card */}
          {!loading && (
            <div ref={applyProfileBtnRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 20px", marginBottom: 16, border: "1px solid var(--neuron-ui-border)", borderRadius: 10, backgroundColor: "var(--neuron-bg-elevated)", flexWrap: "wrap" }}>
              {/* Left: user identity + profile context */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: "var(--neuron-bg-surface-subtle)", border: "1.5px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "var(--neuron-ink-muted)", flexShrink: 0 }}>
                  {(user.name || user.email || "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>{user.name}</span>
                    <span style={{ fontSize: 11, color: "var(--neuron-ui-border)" }}>·</span>
                    <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{user.department}</span>
                    <span style={{ fontSize: 11, color: "var(--neuron-ui-border)" }}>·</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, backgroundColor: rc.bg, color: rc.text, flexShrink: 0 }}>
                      {roleLabel}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {showProfileBadge && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 999, backgroundColor: "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)", color: "var(--neuron-action-primary)" }}>
                        <BookMarked size={10} />
                        Based on: {appliedProfileName}
                      </span>
                    )}
                    {lastSaved && (
                      <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>
                        {showProfileBadge && <span style={{ marginRight: 4, color: "var(--neuron-ui-border)" }}>·</span>}
                        Saved by {lastSaved.by} {formatRelativeTime(lastSaved.at)}
                      </span>
                    )}
                    {!showProfileBadge && !lastSaved && (
                      <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>No profile applied</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <AnimatePresence>
                  {isDirty && (
                    <motion.div
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--theme-status-warning-fg)", padding: "5px 10px", borderRadius: 8, backgroundColor: "var(--theme-status-warning-bg)" }}>
                        <AlertTriangle size={12} /> Unsaved changes
                      </div>
                      <button
                        onClick={handleReset}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                        title="Discard all unsaved changes"
                      >
                        <RotateCcw size={11} /> Reset
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => setShowApplyProfileMenu(v => !v)}
                  style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "color 0.12s, border-color 0.12s" }}
                >
                  <BookMarked size={13} /> Apply Profile <ChevronDown size={11} style={{ opacity: 0.6 }} />
                </button>

                {/* Save as Profile */}
                {hasGrantOverrides(overrides) && (
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowSaveAsProfile(v => !v)}
                      style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <BookOpen size={13} /> Save as Profile
                    </button>
                    {showSaveAsProfile && (
                      <SaveAsProfileForm
                        grants={overrides}
                        onSaved={() => {}}
                        onClose={() => setShowSaveAsProfile(false)}
                      />
                    )}
                  </div>
                )}

                {/* Save Changes */}
                <button
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  style={{
                    height: 34, padding: "0 16px", borderRadius: 8,
                    background: isDirty ? "var(--neuron-action-primary)" : "var(--neuron-bg-surface-subtle)",
                    border: "none",
                    color: isDirty ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-muted)",
                    fontSize: 13, fontWeight: 600,
                    cursor: isDirty && !saving ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "background-color 0.15s, color 0.15s",
                    opacity: saving ? 0.7 : 1,
                  }}
                  onMouseEnter={e => { if (isDirty && !saving) e.currentTarget.style.background = "var(--neuron-action-primary-hover)"; }}
                  onMouseLeave={e => { if (isDirty && !saving) e.currentTarget.style.background = "var(--neuron-action-primary)"; }}
                >
                  <Save size={13} />
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>

              {/* Full-width profile dropdown */}
              {showApplyProfileMenu && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100, backgroundColor: "var(--neuron-bg-elevated)", borderRadius: 10, border: "1px solid var(--neuron-ui-border)", overflow: "hidden" }}>
                  {profiles.length === 0 ? (
                    <div style={{ padding: "16px", fontSize: 12, color: "var(--neuron-ink-muted)", textAlign: "center" }}>No profiles yet</div>
                  ) : (
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      {profiles.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleApplyProfile(p)}
                          style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "10px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderTop: "1px solid var(--neuron-ui-border)", transition: "background-color 0.1s" }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--neuron-bg-surface-subtle)"}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)" }}>{p.name}</span>
                          {p.target_department && (
                            <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)", marginTop: 1 }}>{p.target_department}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <PermissionGrantEditor
            grants={overrides}
            onChange={(nextGrants) => handleGrantChange(nextGrants)}
            baselineRole={user.role}
            baselineDepartment={user.department}
            showInheritedBaseline={true}
            loading={loading}
          />
        </div>
      </div>

      {/* Sticky save bar — visible only while there are unsaved changes.
          Sits below the scrollable body so it remains visible during matrix scroll. */}
      <AnimatePresence>
        {isDirty && !loading && (
          <motion.div
            key="sticky-save-bar"
            initial={{ y: 56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 56, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--neuron-bg-elevated)",
              padding: "10px 40px",
              boxShadow: "0 -8px 20px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--theme-status-warning-fg)", padding: "5px 10px", borderRadius: 8, backgroundColor: "var(--theme-status-warning-bg)" }}>
                  <AlertTriangle size={12} /> You have unsaved access changes
                </div>
                {appliedProfileId && changedAfterProfileApply && (
                  <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>
                    Profile <strong>{appliedProfileName}</strong> will be detached on save.
                  </span>
                )}
                {appliedProfileId && !changedAfterProfileApply && (
                  <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>
                    Applying profile <strong>{appliedProfileName}</strong> — save to confirm.
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
                  title="Discard all unsaved changes"
                >
                  <RotateCcw size={12} /> Discard changes
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    height: 34, padding: "0 18px", borderRadius: 8,
                    background: "var(--neuron-action-primary)",
                    border: "none",
                    color: "var(--neuron-action-primary-text)",
                    fontSize: 13, fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <Save size={13} />
                  {saving ? "Saving changes…" : "Save changes"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NeuronModal
        isOpen={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave without saving?"
        description={`You have unsaved changes to ${user.name}'s access rules. They will be lost if you leave now.`}
        confirmLabel="Leave without saving"
        onConfirm={onBack}
        variant="warning"
      />

    </div>
  );
}
