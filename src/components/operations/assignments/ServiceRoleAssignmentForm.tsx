/**
 * ServiceRoleAssignmentForm — V1 replacement for TeamAssignmentForm.
 *
 * Renders the service-driven assignment UI:
 *   • Service Manager     — locked, derived from operational_services
 *   • Team                — optional assignment team (autofills + filters role pickers)
 *   • One row per service role — user picker per role
 *   • Source badge        — service / customer / trade-party / manual
 *   • Save as default     — writes assignment_default_profiles
 *
 * Reads via useAssignmentResolution and emits a flat payload up to the parent.
 * Parents (create panels, BookingAssignmentSection) own the persistence step.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { CustomDropdown } from '../../bd/CustomDropdown';
import { Checkbox } from '../../ui/checkbox';
import { useAssignmentResolution } from '../../../hooks/useAssignmentResolution';
import type {
  AssignmentResolution,
  BookingAssignmentInput,
  BookingAssignmentSource,
} from '../../../types/assignments';

interface ServiceRoleAssignmentFormProps {
  customerId: string | null | undefined;
  tradePartyProfileId?: string | null;
  serviceType: string;
  /** Pre-selected assignments (when editing an existing booking). */
  initialAssignments?: BookingAssignmentInput[];
  /** Pre-selected team (when editing an existing booking). */
  initialTeamId?: string | null;
  /** Hide the "Save as default" checkbox (e.g. on detail edit where it ships separately). */
  hideSaveAsDefault?: boolean;
  onChange: (payload: ServiceRoleAssignmentPayload) => void;
}

export interface ServiceRoleAssignmentPayload {
  serviceType: string;
  service: AssignmentResolution['service'];
  teamPool: { id: string | null; name: string | null };
  /** Booking-side rows (one per filled role). */
  assignments: BookingAssignmentInput[];
  /** Whether all required roles have a user picked. */
  isComplete: boolean;
  /** True if any role is required but unfilled. */
  hasMissingRequired: boolean;
  /** v1: 'customer' or 'trade_party' if the user opted into saving. */
  saveAsDefault: false | 'customer' | 'trade_party';
  /** Source badge for the parent to display. */
  source: AssignmentResolution['source'];
}

interface UserOption {
  id: string;
  name: string;
}

const ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  borderTop: '1px solid var(--theme-border-default)',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--theme-text-muted)',
  letterSpacing: '0.01em',
};

export function ServiceRoleAssignmentForm({
  customerId,
  tradePartyProfileId,
  serviceType,
  initialAssignments,
  initialTeamId,
  hideSaveAsDefault,
  onChange,
}: ServiceRoleAssignmentFormProps) {
  const { resolution, isLoading } = useAssignmentResolution({
    customerId,
    tradePartyProfileId,
    serviceType,
  });

  // Picks are stored as role_key -> { user_id, user_name } so changes per-row
  // don't reset the others.
  const [picks, setPicks] = useState<Record<string, { id: string; name: string }>>(() => {
    const seed: Record<string, { id: string; name: string }> = {};
    for (const a of initialAssignments ?? []) {
      if (a.user_id) seed[a.role_key] = { id: a.user_id, name: a.user_name };
    }
    return seed;
  });
  const [teamId, setTeamId] = useState<string | null>(initialTeamId ?? null);
  const [saveAsDefault, setSaveAsDefault] = useState<false | 'customer' | 'trade_party'>(false);
  const [touchedKeys, setTouchedKeys] = useState<Set<string>>(new Set());
  const seededFromResolution = useRef(false);

  const [eligibleUsersByRole, setEligibleUsersByRole] = useState<Record<string, UserOption[]>>({});
  const [eligibleUsersByTeamRole, setEligibleUsersByTeamRole] = useState<
    Record<string, Record<string, UserOption[]>>
  >({});
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('teams')
      .select('id, name, service_type')
      .eq('department', 'Operations')
      .order('name')
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) return;

        const filteredTeams = ((data ?? []) as Array<{
          id: string;
          name: string;
          service_type: string | null;
        }>)
          .filter((t) => !t.service_type || t.service_type === serviceType)
          .map((t) => ({ id: t.id, name: t.name }));
        setTeams(filteredTeams);

        if (filteredTeams.length === 0) {
          setEligibleUsersByRole({});
          setEligibleUsersByTeamRole({});
          return;
        }

        const { data: membershipRows, error: membershipError } = await supabase
          .from('team_memberships')
          .select(`
            team_id,
            user_id,
            users!inner(id, name),
            team_role_eligibilities(role_key, role_label, sort_order)
          `)
          .eq('is_active', true)
          .in('team_id', filteredTeams.map((team) => team.id));

        if (cancelled || membershipError) return;

        const byRole = new Map<string, Map<string, UserOption>>();
        const byTeamRole = new Map<string, Map<string, Map<string, UserOption>>>();

        for (const row of (membershipRows ?? []) as Array<{
          team_id: string;
          user_id: string;
          users: { id: string; name: string };
          team_role_eligibilities?: Array<{ role_key: string }> | null;
        }>) {
          const userOption = {
            id: row.users.id,
            name: row.users.name,
          };
          for (const eligibility of row.team_role_eligibilities ?? []) {
            const roleUsers = byRole.get(eligibility.role_key) ?? new Map<string, UserOption>();
            roleUsers.set(userOption.id, userOption);
            byRole.set(eligibility.role_key, roleUsers);

            const teamRoles = byTeamRole.get(row.team_id) ?? new Map<string, Map<string, UserOption>>();
            const teamRoleUsers =
              teamRoles.get(eligibility.role_key) ?? new Map<string, UserOption>();
            teamRoleUsers.set(userOption.id, userOption);
            teamRoles.set(eligibility.role_key, teamRoleUsers);
            byTeamRole.set(row.team_id, teamRoles);
          }
        }

        setEligibleUsersByRole(
          Object.fromEntries(
            Array.from(byRole.entries()).map(([roleKey, users]) => [
              roleKey,
              Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name)),
            ]),
          ),
        );
        setEligibleUsersByTeamRole(
          Object.fromEntries(
            Array.from(byTeamRole.entries()).map(([teamKey, roleMap]) => [
              teamKey,
              Object.fromEntries(
                Array.from(roleMap.entries()).map(([roleKey, users]) => [
                  roleKey,
                  Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name)),
                ]),
              ),
            ]),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [serviceType]);

  // Seed picks from resolved defaults exactly once when resolution arrives,
  // unless the parent already provided initialAssignments.
  useEffect(() => {
    if (!resolution || seededFromResolution.current) return;
    seededFromResolution.current = true;

    if (!initialTeamId && resolution.teamPool.id) {
      setTeamId(resolution.teamPool.id);
    }

    setPicks((current) => {
      // Don't overwrite anything already chosen.
      const next = { ...current };
      for (const slot of resolution.assignments) {
        if (slot.user_id && !next[slot.role_key]) {
          next[slot.role_key] = { id: slot.user_id, name: slot.user_name ?? '' };
        }
      }
      return next;
    });
  }, [resolution]);

  const applyTeamSelection = (nextTeamId: string | null) => {
    setTeamId(nextTeamId);

    setPicks((current) => {
      if (!nextTeamId) return current;

      const next = { ...current };
      const changedKeys = new Set<string>();

      for (const role of resolution.roles) {
        const allowedUsers = eligibleUsersByTeamRole[nextTeamId]?.[role.role_key] ?? [];
        const currentPick = next[role.role_key];

        if (currentPick && allowedUsers.some((user) => user.id === currentPick.id)) {
          continue;
        }

        const nextPick = allowedUsers.length === 1 ? allowedUsers[0] : null;
        if (nextPick) {
          if (!currentPick || currentPick.id !== nextPick.id || currentPick.name !== nextPick.name) {
            next[role.role_key] = { id: nextPick.id, name: nextPick.name };
            changedKeys.add(role.role_key);
          }
          continue;
        }

        if (currentPick) {
          delete next[role.role_key];
          changedKeys.add(role.role_key);
        }
      }

      if (changedKeys.size > 0) {
        setTouchedKeys((existing) => {
          const merged = new Set(existing);
          changedKeys.forEach((key) => merged.add(key));
          return merged;
        });
      }

      return next;
    });
  };

  // Emit upward whenever inputs change.
  const inputsRef = useRef({ picks, teamId, saveAsDefault, resolution });
  inputsRef.current = { picks, teamId, saveAsDefault, resolution };

  useEffect(() => {
    if (!resolution) return;
    const teamName = teams.find((t) => t.id === teamId)?.name ?? null;
    const assignments: BookingAssignmentInput[] = resolution.roles
      .filter((r) => picks[r.role_key]?.id)
      .map((r) => ({
        role_key: r.role_key,
        role_label: r.role_label,
        user_id: picks[r.role_key].id,
        user_name: picks[r.role_key].name,
        source: deriveSource(resolution.source, touchedKeys.has(r.role_key)),
      }));

    const requiredKeys = resolution.roles.filter((r) => r.required).map((r) => r.role_key);
    const hasMissingRequired = requiredKeys.some((k) => !picks[k]?.id);

    onChange({
      serviceType,
      service: resolution.service,
      teamPool: { id: teamId, name: teamName },
      assignments,
      isComplete: !hasMissingRequired,
      hasMissingRequired,
      saveAsDefault,
      source: resolution.source,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, teamId, saveAsDefault, resolution, teams, serviceType, touchedKeys]);

  const userOptionsForRole = useMemo(() => {
    if (!resolution) return {};
    const entries = resolution.roles.map((role) => {
      const baseOptions = teamId
        ? eligibleUsersByTeamRole[teamId]?.[role.role_key] ?? []
        : eligibleUsersByRole[role.role_key] ?? [];
      const pick = picks[role.role_key];
      if (pick && !baseOptions.some((option) => option.id === pick.id)) {
        return [role.role_key, [{ id: pick.id, name: pick.name }, ...baseOptions]] as const;
      }
      return [role.role_key, baseOptions] as const;
    });
    return Object.fromEntries(entries);
  }, [eligibleUsersByRole, eligibleUsersByTeamRole, picks, resolution, teamId]);

  if (isLoading || !resolution) {
    return (
      <div style={{ padding: '12px 0', color: 'var(--theme-text-muted)', fontSize: '13px' }}>
        Loading assignment options…
      </div>
    );
  }

  if (resolution.roles.length === 0) {
    return (
      <div style={{ padding: '12px 0', color: 'var(--theme-text-muted)', fontSize: '13px' }}>
        No assignment roles defined for {serviceType}. Configure them in Users → Teams → Operations.
      </div>
    );
  }

  return (
    <div>
      {/* Source badge + service name */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={14} style={{ color: 'var(--theme-action-primary-bg)' }} />
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--theme-text-primary)' }}>
            {resolution.service?.label ?? serviceType}
          </span>
          <SourceBadge source={resolution.source} />
        </div>
      </div>

      {/* Team picker (optional) */}
      <div style={{ marginBottom: '12px' }}>
        <CustomDropdown
          label="Team (Optional)"
          value={teamId ?? ''}
          onChange={(v) => applyTeamSelection(v || null)}
          options={[
            { value: '', label: 'No team selected' },
            ...teams.map((t) => ({ value: t.id, label: t.name })),
          ]}
          placeholder="No team selected"
          fullWidth
        />
      </div>

      {/* Crew table */}
      <div
        style={{
          border: '1px solid var(--theme-border-default)',
          borderRadius: '7px',
          overflow: 'hidden',
        }}
      >
        {/* Service Manager — locked */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr 24px',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            background: 'var(--theme-bg-page)',
          }}
        >
          <span style={LABEL_STYLE}>Service Manager</span>
          <span
            style={{
              fontSize: '13px',
              color: resolution.service?.default_manager_name
                ? 'var(--theme-text-primary)'
                : 'var(--theme-text-muted)',
              fontStyle: resolution.service?.default_manager_name ? undefined : 'italic',
            }}
          >
            {resolution.service?.default_manager_name || 'No service manager set'}
          </span>
          <Lock size={12} color="var(--theme-text-muted)" />
        </div>

        {/* One row per role */}
        {resolution.roles.map((role) => {
          const pick = picks[role.role_key];
          const roleUsers = userOptionsForRole[role.role_key] ?? [];
          return (
            <div key={role.role_key} style={ROW_STYLE}>
              <span style={LABEL_STYLE}>
                {role.role_label}
                {role.required ? <span style={{ color: '#C94F3D' }}> *</span> : null}
              </span>
              <CustomDropdown
                value={pick?.id ?? ''}
                onChange={(v) => {
                  const u = roleUsers.find((x) => x.id === v);
                  setPicks((p) => {
                    const next = { ...p };
                    if (!v) delete next[role.role_key];
                    else next[role.role_key] = { id: v, name: u?.name ?? '' };
                    return next;
                  });
                  setTouchedKeys((s) => new Set(s).add(role.role_key));
                }}
                options={[
                  { value: '', label: '— None —' },
                  ...roleUsers.map((u) => ({ value: u.id, label: u.name })),
                ]}
                placeholder="Select user…"
                fullWidth
              />
            </div>
          );
        })}
      </div>

      {/* Save as default */}
      {!hideSaveAsDefault && (customerId || tradePartyProfileId) && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {customerId && (
            <label
              htmlFor="save-as-customer-default"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--theme-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <Checkbox
                id="save-as-customer-default"
                checked={saveAsDefault === 'customer'}
                onCheckedChange={(checked) =>
                  setSaveAsDefault(checked === true ? 'customer' : false)
                }
              />
              Save as default for this customer
            </label>
          )}
          {tradePartyProfileId && (
            <label
              htmlFor="save-as-tp-default"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--theme-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <Checkbox
                id="save-as-tp-default"
                checked={saveAsDefault === 'trade_party'}
                onCheckedChange={(checked) =>
                  setSaveAsDefault(checked === true ? 'trade_party' : false)
                }
              />
              Save as default for this consignee/shipper
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function deriveSource(
  resolutionSource: AssignmentResolution['source'],
  touched: boolean,
): BookingAssignmentSource {
  if (touched) return 'manual';
  switch (resolutionSource) {
    case 'trade_party_default':
      return 'trade_party_default';
    case 'customer_default':
      return 'customer_default';
    case 'service_default':
      return 'service_default';
    case 'legacy_customer_team_profile':
      return 'customer_default';
    default:
      return 'manual';
  }
}

function SourceBadge({ source }: { source: AssignmentResolution['source'] }) {
  const text =
    source === 'trade_party_default'
      ? 'Trade-party default'
      : source === 'customer_default'
      ? 'Customer default'
      : source === 'service_default'
      ? 'Service default'
      : source === 'legacy_customer_team_profile'
      ? 'Saved profile'
      : 'New';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--theme-action-primary-bg)',
        background: 'rgba(15, 118, 110, 0.08)',
        border: '1px solid rgba(15, 118, 110, 0.2)',
        borderRadius: '4px',
        padding: '1px 6px',
        lineHeight: '18px',
      }}
    >
      {text}
    </span>
  );
}
