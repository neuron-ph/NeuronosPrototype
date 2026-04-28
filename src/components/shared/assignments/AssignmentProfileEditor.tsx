/**
 * AssignmentProfileEditor — generalized assignment profile form.
 *
 * Handles both Operations (service-scoped, role-catalog slots, team picker)
 * and non-Operations (department-level, freeform role rows) profiles.
 *
 * Does NOT auto-resolve defaults — initial values come from props (existing
 * saved items). Parents own the save step via replace_assignment_profile_atomic.
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2, Lock } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { CustomDropdown } from '../../bd/CustomDropdown';
import type { ServiceAssignmentRole } from '../../../types/assignments';
import { fetchDeptTeams, fetchEligibleUsersByRole, type TeamOption } from '../../../utils/assignments/eligibilityHelpers';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileItem {
  role_key:   string;
  role_label: string;
  user_id:    string;
  user_name:  string;
}

export interface AssignmentProfileEditorPayload {
  teamId: string | null;
  items:  ProfileItem[];
  isValid: boolean;
}

interface AssignmentProfileEditorProps {
  department:       string;
  serviceType?:     string | null;
  initialTeamId?:   string | null;
  initialItems?:    ProfileItem[];
  onChange:         (payload: AssignmentProfileEditorPayload) => void;
}

interface UserOption { id: string; name: string }


function generateRoleKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ─── Ops editor (role-catalog slots + team picker) ───────────────────────────

function OpsEditor({
  serviceType,
  initialTeamId,
  initialItems,
  onChange,
}: {
  serviceType:    string;
  initialTeamId:  string | null;
  initialItems:   ProfileItem[];
  onChange:       (payload: AssignmentProfileEditorPayload) => void;
}) {
  const [roles, setRoles]   = useState<ServiceAssignmentRole[]>([]);
  const [teams, setTeams]   = useState<UserOption[]>([]);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [defaultManagerName, setDefaultManagerName] = useState<string | null>(null);

  const [eligibleByRole, setEligibleByRole]          = useState<Record<string, UserOption[]>>({});
  const [eligibleByTeamRole, setEligibleByTeamRole]  = useState<Record<string, Record<string, UserOption[]>>>({});
  const [picks, setPicks] = useState<Record<string, UserOption>>(() => {
    const seed: Record<string, UserOption> = {};
    for (const item of initialItems) {
      if (item.user_id) seed[item.role_key] = { id: item.user_id, name: item.user_name };
    }
    return seed;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: roleData }, { data: svcData }, { data: teamData }] = await Promise.all([
        supabase
          .from('service_assignment_roles')
          .select('*')
          .eq('service_type', serviceType)
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('operational_services')
          .select('default_manager_name')
          .eq('service_type', serviceType)
          .maybeSingle(),
        supabase
          .from('teams')
          .select('id, name, service_type')
          .eq('department', 'Operations')
          .order('name'),
      ]);
      if (cancelled) return;

      setRoles((roleData ?? []) as ServiceAssignmentRole[]);
      setDefaultManagerName((svcData as { default_manager_name: string | null } | null)?.default_manager_name ?? null);

      const filteredTeams = ((teamData ?? []) as Array<{ id: string; name: string; service_type: string | null }>)
        .filter((t) => !t.service_type || t.service_type === serviceType)
        .map((t) => ({ id: t.id, name: t.name }));
      setTeams(filteredTeams);

      if (filteredTeams.length === 0) return;

      const { data: memberships } = await supabase
        .from('team_memberships')
        .select('team_id, user_id, users!inner(id, name), team_role_eligibilities(role_key)')
        .eq('is_active', true)
        .in('team_id', filteredTeams.map((t) => t.id));

      if (cancelled) return;

      const byRole   = new Map<string, Map<string, UserOption>>();
      const byTeam   = new Map<string, Map<string, Map<string, UserOption>>>();

      for (const row of (memberships ?? []) as unknown as Array<{
        team_id: string;
        user_id: string;
        users: { id: string; name: string };
        team_role_eligibilities?: Array<{ role_key: string }> | null;
      }>) {
        const u = { id: row.users.id, name: row.users.name };
        for (const e of row.team_role_eligibilities ?? []) {
          const rk = e.role_key;
          if (!byRole.has(rk)) byRole.set(rk, new Map());
          byRole.get(rk)!.set(u.id, u);

          if (!byTeam.has(row.team_id)) byTeam.set(row.team_id, new Map());
          if (!byTeam.get(row.team_id)!.has(rk)) byTeam.get(row.team_id)!.set(rk, new Map());
          byTeam.get(row.team_id)!.get(rk)!.set(u.id, u);
        }
      }

      const toArr = (m: Map<string, UserOption>) =>
        Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));

      setEligibleByRole(Object.fromEntries(Array.from(byRole.entries()).map(([k, v]) => [k, toArr(v)])));
      setEligibleByTeamRole(
        Object.fromEntries(
          Array.from(byTeam.entries()).map(([tid, roleMap]) => [
            tid,
            Object.fromEntries(Array.from(roleMap.entries()).map(([rk, um]) => [rk, toArr(um)])),
          ]),
        ),
      );
    })();
    return () => { cancelled = true; };
  }, [serviceType]);

  // Emit on every change
  useEffect(() => {
    const items: ProfileItem[] = Object.entries(picks)
      .filter(([, u]) => u.id)
      .map(([roleKey, u]) => {
        const role = roles.find((r) => r.role_key === roleKey);
        return {
          role_key:   roleKey,
          role_label: role?.role_label ?? roleKey,
          user_id:    u.id,
          user_name:  u.name,
        };
      });
    const requiredKeys = roles.filter((r) => r.required).map((r) => r.role_key);
    const isValid = requiredKeys.every((k) => !!picks[k]?.id);
    onChange({ teamId, items, isValid });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, teamId, roles]);

  const handleTeamChange = (nextTeamId: string | null) => {
    setTeamId(nextTeamId);
    if (!nextTeamId) return;
    setPicks((cur) => {
      const next = { ...cur };
      for (const role of roles) {
        const allowed = eligibleByTeamRole[nextTeamId]?.[role.role_key] ?? [];
        const current = next[role.role_key];
        if (current && allowed.some((u) => u.id === current.id)) continue;
        const auto = allowed.length === 1 ? allowed[0] : null;
        if (auto) next[role.role_key] = auto;
        else delete next[role.role_key];
      }
      return next;
    });
  };

  if (roles.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Team picker */}
      <CustomDropdown
        label="Team (Optional)"
        value={teamId ?? ''}
        onChange={(v) => handleTeamChange(v || null)}
        options={[{ value: '', label: 'No team' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
        placeholder="No team"
        fullWidth
      />

      {/* Role rows */}
      <div style={{ border: '1px solid var(--neuron-ui-border)', borderRadius: '7px', overflow: 'hidden' }}>
        {/* Locked service manager row */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '140px 1fr 20px',
            alignItems: 'center', gap: '12px', padding: '10px 12px',
            background: 'var(--theme-bg-page)',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--theme-text-muted)' }}>Service Manager</span>
          <span style={{
            fontSize: '13px',
            color: defaultManagerName ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
            fontStyle: defaultManagerName ? undefined : 'italic',
          }}>
            {defaultManagerName ?? 'No service manager set'}
          </span>
          <Lock size={12} color="var(--theme-text-muted)" />
        </div>

        {roles.map((role, i) => {
          const pick = picks[role.role_key];
          const baseOptions = teamId
            ? eligibleByTeamRole[teamId]?.[role.role_key] ?? []
            : eligibleByRole[role.role_key] ?? [];
          const options = pick && !baseOptions.some((u) => u.id === pick.id)
            ? [pick, ...baseOptions]
            : baseOptions;

          return (
            <div
              key={role.role_key}
              style={{
                display: 'grid', gridTemplateColumns: '140px 1fr',
                alignItems: 'center', gap: '12px', padding: '10px 12px',
                borderTop: i === 0 ? '1px solid var(--neuron-ui-border)' : '1px solid var(--neuron-ui-border)',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--theme-text-muted)' }}>
                {role.role_label}
                {role.required && <span style={{ color: '#C94F3D' }}> *</span>}
              </span>
              <CustomDropdown
                value={pick?.id ?? ''}
                onChange={(v) => {
                  const u = options.find((x) => x.id === v);
                  setPicks((p) => {
                    const next = { ...p };
                    if (!v) delete next[role.role_key];
                    else next[role.role_key] = { id: v, name: u?.name ?? '' };
                    return next;
                  });
                }}
                options={[{ value: '', label: '— None —' }, ...options.map((u) => ({ value: u.id, label: u.name }))]}
                placeholder="Select user…"
                fullWidth
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Non-Ops editor (canonical roles + team picker) ──────────────────────────

interface FreeformRow {
  role_key:   string;
  role_label: string;
  user_id:    string;
  user_name:  string;
}

interface CanonicalRole {
  role_key:   string;
  role_label: string;
}

function FreeformEditor({
  department,
  initialTeamId,
  initialItems,
  onChange,
}: {
  department:    string;
  initialTeamId: string | null;
  initialItems:  ProfileItem[];
  onChange:      (payload: AssignmentProfileEditorPayload) => void;
}) {
  const emptyRow = (): FreeformRow => ({ role_key: '', role_label: '', user_id: '', user_name: '' });
  const [rows, setRows] = useState<FreeformRow[]>(
    initialItems.length > 0 ? initialItems.map((i) => ({ ...i })) : [emptyRow()],
  );

  const [canonicalRoles, setCanonicalRoles]           = useState<CanonicalRole[]>([]);
  const [teams, setTeams]                             = useState<TeamOption[]>([]);
  const [teamId, setTeamId]                           = useState<string | null>(initialTeamId);
  // Users in any dept team with any eligible role (canonical pool)
  const [eligibleDeptUsers, setEligibleDeptUsers]     = useState<UserOption[]>([]);
  // Eligible users per role across ALL dept teams (no team selected)
  const [eligibleAnyTeamByRole, setEligibleAnyTeamByRole] = useState<Record<string, UserOption[]>>({});
  // Eligible users per role for the SELECTED team
  const [eligibleByRole, setEligibleByRole]           = useState<Record<string, UserOption[]>>({});
  // True once we know whether teams exist; false means fall back to all dept users
  const [hasDeptTeams, setHasDeptTeams]               = useState(false);
  // Fallback when no teams are defined yet
  const [allDeptUsers, setAllDeptUsers]               = useState<UserOption[]>([]);

  // Load canonical roles, dept teams, and cross-team eligibilities
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: roleData }, deptTeams, { data: fallbackUsers }] = await Promise.all([
        supabase
          .from('department_assignment_roles')
          .select('role_key, role_label')
          .eq('department', department)
          .eq('is_active', true)
          .order('sort_order'),
        fetchDeptTeams(department),
        supabase
          .from('users')
          .select('id, name')
          .eq('department', department)
          .eq('is_active', true)
          .order('name'),
      ]);
      if (cancelled) return;
      setCanonicalRoles((roleData ?? []) as CanonicalRole[]);
      setTeams(deptTeams);
      setAllDeptUsers((fallbackUsers ?? []) as UserOption[]);
      setHasDeptTeams(deptTeams.length > 0);

      if (deptTeams.length === 0) return;

      // Load all memberships across every dept team to build eligibility maps
      const { data: memberData } = await supabase
        .from('team_memberships')
        .select('user_id, users!inner(id, name), team_role_eligibilities(role_key)')
        .in('team_id', deptTeams.map((t) => t.id))
        .eq('is_active', true);

      if (cancelled) return;

      const byRole  = new Map<string, Map<string, UserOption>>();
      const allSeen = new Map<string, UserOption>();

      for (const row of (memberData ?? []) as unknown as Array<{
        users: { id: string; name: string };
        team_role_eligibilities?: Array<{ role_key: string }> | null;
      }>) {
        const u = { id: row.users.id, name: row.users.name };
        allSeen.set(u.id, u);
        for (const e of row.team_role_eligibilities ?? []) {
          if (!byRole.has(e.role_key)) byRole.set(e.role_key, new Map());
          byRole.get(e.role_key)!.set(u.id, u);
        }
      }

      const toArr = (m: Map<string, UserOption>) =>
        Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));

      setEligibleAnyTeamByRole(
        Object.fromEntries(Array.from(byRole.entries()).map(([rk, um]) => [rk, toArr(um)])),
      );
      setEligibleDeptUsers(
        Array.from(allSeen.values()).sort((a, b) => a.name.localeCompare(b.name)),
      );
    })();
    return () => { cancelled = true; };
  }, [department]);

  // When team changes, reload per-team eligibilities
  useEffect(() => {
    if (!teamId) { setEligibleByRole({}); return; }
    let cancelled = false;
    void fetchEligibleUsersByRole(teamId).then((byRole) => {
      if (!cancelled) setEligibleByRole(byRole);
    });
    return () => { cancelled = true; };
  }, [teamId]);

  const usersForRow = (row: FreeformRow): UserOption[] => {
    let pool: UserOption[];
    if (!hasDeptTeams) {
      // No teams defined yet — fall back to all dept users
      pool = allDeptUsers;
    } else if (teamId) {
      // Team selected — show only users eligible for this role in that team
      pool = eligibleByRole[row.role_key] ?? [];
    } else if (row.role_key) {
      // No team selected — show users eligible for this role in any dept team
      pool = eligibleAnyTeamByRole[row.role_key] ?? eligibleDeptUsers;
    } else {
      // No role set yet — show all users who are in any dept team
      pool = eligibleDeptUsers;
    }
    // Always include the current pick even if it no longer matches (data guard)
    if (row.user_id && !pool.some((u) => u.id === row.user_id)) {
      return [{ id: row.user_id, name: row.user_name }, ...pool];
    }
    return pool;
  };

  const emit = (updated: FreeformRow[], nextTeamId: string | null) => {
    const items = updated.filter((r) => r.role_key && r.user_id);
    onChange({ teamId: nextTeamId, items, isValid: items.length > 0 });
  };

  const updateRow = (idx: number, patch: Partial<FreeformRow>) => {
    const updated = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    setRows(updated);
    emit(updated, teamId);
  };

  const addRow = () => {
    const next = canonicalRoles.find((r) => !rows.some((row) => row.role_key === r.role_key));
    setRows((r) => [
      ...r,
      { role_key: next?.role_key ?? '', role_label: next?.role_label ?? '', user_id: '', user_name: '' },
    ]);
  };

  const removeRow = (idx: number) => {
    const updated = rows.filter((_, i) => i !== idx);
    const next = updated.length > 0 ? updated : [emptyRow()];
    setRows(next);
    emit(next, teamId);
  };

  const handleTeamChange = (nextTeamId: string | null) => {
    setTeamId(nextTeamId);
    // Clear user picks that are no longer valid for the new team
    const clearRows = rows.map((r) => ({ ...r, user_id: '', user_name: '' }));
    setRows(clearRows);
    emit(clearRows, nextTeamId);
  };

  const roleOptions = canonicalRoles.length > 0
    ? [{ value: '', label: 'Select role…' }, ...canonicalRoles.map((r) => ({ value: r.role_label, label: r.role_label }))]
    : null;

  return (
    <div className="space-y-3">
      {/* Warning: no canonical teams defined yet */}
      {!hasDeptTeams && (
        <p style={{ fontSize: 12, color: 'var(--theme-status-warning-fg)', background: 'var(--theme-status-warning-bg)', padding: '6px 10px', borderRadius: 6, margin: 0 }}>
          No teams are defined for {department} yet. Set up teams in Users → Teams to enforce canonical membership.
        </p>
      )}

      {/* Team picker */}
      {teams.length > 0 && (
        <CustomDropdown
          label="Team (Optional)"
          value={teamId ?? ''}
          onChange={(v) => handleTeamChange(v || null)}
          options={[{ value: '', label: 'No team' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
          placeholder="No team"
          fullWidth
        />
      )}

      {/* Role/person rows */}
      {rows.map((row, idx) => {
        const userOpts = [{ value: '', label: 'Select person…' }, ...usersForRow(row).map((u) => ({ value: u.id, label: u.name }))];
        return (
          <div key={idx} className="flex items-end gap-2">
            <div style={{ flex: '0 0 180px' }}>
              {roleOptions ? (
                <CustomDropdown
                  label={idx === 0 ? 'Role' : undefined}
                  value={row.role_label}
                  options={roleOptions}
                  onChange={(val) => {
                    const canonical = canonicalRoles.find((r) => r.role_label === val);
                    updateRow(idx, {
                      role_label: val,
                      role_key:   canonical ? canonical.role_key : generateRoleKey(val),
                      user_id:    '',
                      user_name:  '',
                    });
                  }}
                  fullWidth
                />
              ) : (
                <div>
                  {idx === 0 && (
                    <label
                      className="block text-[11px] font-medium uppercase tracking-wide mb-1.5"
                      style={{ color: 'var(--neuron-ink-muted)' }}
                    >
                      Role
                    </label>
                  )}
                  <input
                    type="text"
                    value={row.role_label}
                    onChange={(e) => {
                      const label = e.target.value;
                      updateRow(idx, { role_label: label, role_key: generateRoleKey(label), user_id: '', user_name: '' });
                    }}
                    placeholder="e.g. Account Rep"
                    className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
                    style={{
                      border: '1px solid var(--neuron-ui-border)',
                      backgroundColor: 'var(--theme-bg-surface)',
                      color: 'var(--neuron-ink-primary)',
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <CustomDropdown
                label={idx === 0 ? 'Assigned To' : undefined}
                value={row.user_id}
                options={userOpts}
                onChange={(v) => {
                  const u = usersForRow(row).find((x) => x.id === v);
                  updateRow(idx, { user_id: v, user_name: u?.name ?? '' });
                }}
                fullWidth
              />
            </div>

            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="mb-0.5 p-1.5 rounded transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Remove"
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FEF2F2'; (e.currentTarget as HTMLElement).style.color = '#C94F3D'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-muted)'; }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-[12px] font-medium"
        style={{ color: 'var(--theme-action-primary-bg)' }}
      >
        <Plus size={14} />
        Add person
      </button>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function AssignmentProfileEditor({
  department,
  serviceType,
  initialTeamId,
  initialItems = [],
  onChange,
}: AssignmentProfileEditorProps) {
  const isOps = department === 'Operations';

  if (isOps && serviceType) {
    return (
      <OpsEditor
        serviceType={serviceType}
        initialTeamId={initialTeamId ?? null}
        initialItems={initialItems}
        onChange={onChange}
      />
    );
  }

  return (
    <FreeformEditor
      department={department}
      initialTeamId={initialTeamId ?? null}
      initialItems={initialItems}
      onChange={onChange}
    />
  );
}
