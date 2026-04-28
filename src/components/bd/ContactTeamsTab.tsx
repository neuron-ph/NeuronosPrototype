/**
 * ContactTeamsTab — reads canonical assignment_profiles.
 *
 * Shows customer profiles (scope_kind='default') as inherited baselines and
 * contact overrides (scope_kind='override', subject_type='contact') inline.
 * Writes via replace_assignment_profile_atomic. Stops writing to
 * contact_team_overrides.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Edit2, X } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { useUser } from '../../hooks/useUser';
import { toast } from '../ui/toast-utils';
import {
  AssignmentProfileEditor,
  type AssignmentProfileEditorPayload,
} from '../shared/assignments/AssignmentProfileEditor';
import type { AssignmentProfile, AssignmentProfileItem } from '../../types/assignments';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileWithItems {
  profile: AssignmentProfile;
  items:   AssignmentProfileItem[];
}

interface ContactTeamsTabProps {
  contactId:    string;
  customerId:   string;
  customerName: string;
  canEdit:      boolean;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

const CONTACT_KEY = (contactId: string) => ['contact_assignment_profiles', contactId];
const CUSTOMER_KEY = (customerId: string) => ['customer_assignment_profiles', customerId];

async function fetchProfilesWithItems(
  subjectType: string,
  subjectId:   string,
  extraFilter?: { column: string; value: string },
): Promise<ProfileWithItems[]> {
  let query = supabase
    .from('assignment_profiles')
    .select('*')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .eq('is_active', true)
    .order('department')
    .order('service_type');

  if (extraFilter) query = (query as ReturnType<typeof query.eq>).eq(extraFilter.column, extraFilter.value);

  const { data: profiles, error } = await query;
  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);
  const { data: items } = await supabase
    .from('assignment_profile_items')
    .select('*')
    .in('profile_id', ids)
    .order('sort_order');

  return profiles.map((p) => ({
    profile: p as AssignmentProfile,
    items:   ((items ?? []) as AssignmentProfileItem[]).filter((i) => i.profile_id === p.id),
  }));
}

function scopeKey(p: AssignmentProfile) {
  return `${p.department}::${p.service_type ?? ''}`;
}

// ─── Override form ────────────────────────────────────────────────────────────

function OverrideForm({
  contactId,
  customerId,
  userId,
  baseProfile,
  baseItems,
  existingOverride,
  existingOverrideItems,
  onSaved,
  onCancel,
}: {
  contactId:             string;
  customerId:            string;
  userId:                string;
  baseProfile:           AssignmentProfile;
  baseItems:             AssignmentProfileItem[];
  existingOverride?:     AssignmentProfile;
  existingOverrideItems?: AssignmentProfileItem[];
  onSaved:               () => void;
  onCancel:              () => void;
}) {
  const initialItems = (existingOverrideItems ?? baseItems).map((i) => ({
    role_key:   i.role_key,
    role_label: i.role_label,
    user_id:    i.user_id,
    user_name:  i.user_name,
  }));
  const [editorPayload, setEditorPayload] = useState<AssignmentProfileEditorPayload | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const label = baseProfile.service_type
    ? `${baseProfile.department} · ${baseProfile.service_type}`
    : baseProfile.department;

  const handleSave = async () => {
    if (!editorPayload || editorPayload.items.length === 0) {
      toast.error('Add at least one person');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.rpc('replace_assignment_profile_atomic', {
        p_subject_type: 'contact',
        p_subject_id:   contactId,
        p_customer_id:  customerId,
        p_department:   baseProfile.department,
        p_service_type: baseProfile.service_type ?? null,
        p_scope_kind:   'override',
        p_team_id:      editorPayload.teamId ?? null,
        p_assignments:  editorPayload.items,
        p_updated_by:   userId,
      });
      if (error) throw error;
      toast.success('Override saved');
      onSaved();
    } catch (err) {
      console.error('OverrideForm.save', err);
      toast.error('Failed to save override');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{ border: '1px solid var(--theme-action-primary-bg)', backgroundColor: 'var(--theme-bg-surface)' }}
    >
      <p className="text-[13px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
        Override: {label}
      </p>

      <AssignmentProfileEditor
        department={baseProfile.department}
        serviceType={baseProfile.service_type}
        initialTeamId={existingOverride?.team_id ?? null}
        initialItems={initialItems}
        onChange={setEditorPayload}
      />

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity"
          style={{ backgroundColor: 'var(--theme-action-primary-bg)', opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? 'Saving…' : 'Save Override'}
        </button>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
          style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--neuron-ui-border)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Resolved profile card ────────────────────────────────────────────────────

function ResolvedProfileCard({
  baseProfile,
  baseItems,
  override,
  overrideItems,
  canEdit,
  onOverride,
  onClearOverride,
}: {
  baseProfile:    AssignmentProfile;
  baseItems:      AssignmentProfileItem[];
  override?:      AssignmentProfile;
  overrideItems?: AssignmentProfileItem[];
  canEdit:        boolean;
  onOverride:     () => void;
  onClearOverride: () => void;
}) {
  const isOverridden = !!override;
  const displayItems = isOverridden ? (overrideItems ?? []) : baseItems;
  const label = baseProfile.service_type
    ? `${baseProfile.department} · ${baseProfile.service_type}`
    : baseProfile.department;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        border: `1px solid ${isOverridden ? 'var(--theme-action-primary-bg)' : 'var(--neuron-ui-border)'}`,
        backgroundColor: 'var(--theme-bg-surface)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
            {label}
          </span>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: isOverridden ? 'rgba(15,118,110,0.08)' : 'var(--theme-bg-page)',
              color: isOverridden ? 'var(--theme-action-primary-bg)' : 'var(--theme-text-muted)',
              border: `1px solid ${isOverridden ? 'var(--theme-action-primary-bg)' : 'var(--neuron-ui-border)'}`,
            }}
          >
            {isOverridden ? 'Overridden' : 'Inherited'}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              onClick={onOverride}
              className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium"
              style={{ color: 'var(--theme-action-primary-bg)', border: '1px solid var(--theme-action-primary-bg)' }}
            >
              <Edit2 size={11} />
              {isOverridden ? 'Edit Override' : 'Override'}
            </button>
            {isOverridden && (
              <button
                onClick={onClearOverride}
                className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium"
                style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--neuron-ui-border)' }}
                title="Clear override — revert to customer default"
              >
                <X size={11} />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {displayItems.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--theme-text-muted)' }}>No assignments.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {displayItems.map((item) => (
            <div key={item.id}>
              <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--neuron-ink-muted)' }}>
                {item.role_label}
              </p>
              <p className="text-[13px]" style={{ color: 'var(--neuron-ink-primary)' }}>
                {item.user_name || <span style={{ color: 'var(--theme-text-muted)' }}>—</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContactTeamsTab({
  contactId,
  customerId,
  customerName,
  canEdit,
}: ContactTeamsTabProps) {
  const { user } = useUser();
  const qc = useQueryClient();
  const [overridingKey, setOverridingKey] = useState<string | null>(null);

  const { data: customerProfiles, isLoading: loadingCustomer } = useQuery<ProfileWithItems[]>({
    queryKey: CUSTOMER_KEY(customerId),
    enabled:  !!customerId,
    queryFn:  () => fetchProfilesWithItems('customer', customerId),
  });

  const { data: contactOverrides, isLoading: loadingContact } = useQuery<ProfileWithItems[]>({
    queryKey: CONTACT_KEY(contactId),
    enabled:  !!contactId,
    queryFn:  () => fetchProfilesWithItems('contact', contactId),
  });

  const isLoading = loadingCustomer || loadingContact;

  const overrideByKey = new Map(
    (contactOverrides ?? []).map((p) => [scopeKey(p.profile), p]),
  );
  const customerByKey = new Map(
    (customerProfiles ?? []).map((p) => [scopeKey(p.profile), p]),
  );

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: CUSTOMER_KEY(customerId) }),
      qc.invalidateQueries({ queryKey: CONTACT_KEY(contactId) }),
    ]);
  };

  const handleClearOverride = async (key: string) => {
    const override = overrideByKey.get(key);
    if (!override) return;
    try {
      const { error } = await supabase
        .from('assignment_profiles')
        .update({ is_active: false, updated_by: user?.id ?? null })
        .eq('id', override.profile.id);
      if (error) throw error;
      toast.success('Override cleared — inheriting from customer');
      await invalidate();
    } catch {
      toast.error('Failed to clear override');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8" style={{ color: 'var(--theme-text-muted)' }}>
        <Users size={16} />
        <span className="text-[13px]">Loading team profiles…</span>
      </div>
    );
  }

  const displayProfiles = [
    ...(customerProfiles ?? []).map((entry) => ({
      key: scopeKey(entry.profile),
      baseProfile: entry.profile,
      baseItems: entry.items,
      overrideEntry: overrideByKey.get(scopeKey(entry.profile)),
    })),
    ...(contactOverrides ?? [])
      .filter((entry) => !customerByKey.has(scopeKey(entry.profile)))
      .map((entry) => ({
        key: scopeKey(entry.profile),
        baseProfile: entry.profile,
        baseItems: entry.items,
        overrideEntry: entry,
      })),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
          Assignment Profiles
        </h3>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
          Profiles inherited from <span className="font-medium">{customerName}</span>. Override any
          department to set contact-specific assignments.
        </p>
      </div>

      {displayProfiles.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-lg text-center"
          style={{ border: '1px dashed var(--neuron-ui-border)' }}
        >
          <Users size={32} color="var(--theme-text-muted)" className="mb-3" />
          <p className="text-[13px] font-medium" style={{ color: 'var(--neuron-ink-primary)' }}>
            No assignment profiles saved for {customerName}
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>
            Add profiles on the Customer page first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayProfiles.map(({ key, baseProfile, baseItems, overrideEntry }) => {
            return overridingKey === key ? (
              <OverrideForm
                key={key}
                contactId={contactId}
                customerId={customerId}
                userId={user?.id ?? ''}
                baseProfile={baseProfile}
                baseItems={baseItems}
                existingOverride={overrideEntry?.profile}
                existingOverrideItems={overrideEntry?.items}
                onSaved={async () => { setOverridingKey(null); await invalidate(); }}
                onCancel={() => setOverridingKey(null)}
              />
            ) : (
              <ResolvedProfileCard
                key={key}
                baseProfile={baseProfile}
                baseItems={baseItems}
                override={overrideEntry?.profile}
                overrideItems={overrideEntry?.items}
                canEdit={canEdit}
                onOverride={() => setOverridingKey(key)}
                onClearOverride={() => handleClearOverride(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
