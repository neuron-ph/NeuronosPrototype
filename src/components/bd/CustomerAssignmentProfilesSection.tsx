/**
 * CustomerAssignmentProfilesSection
 *
 * Unified replacement for CustomerAssignmentDefaultsTab + CustomerTeamsTab.
 * Reads from and writes to the canonical assignment_profiles /
 * assignment_profile_items tables via replace_assignment_profile_atomic.
 *
 * Old tables (customer_team_profiles, assignment_default_profiles) remain on the
 * database as read-only audit history but are no longer read or written by the app.
 */

import { useState, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Edit2, Trash2, Briefcase, Settings, Tag, BookOpen, Building2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '../../utils/supabase/client';
import { useUser } from '../../hooks/useUser';
import { CustomDropdown } from './CustomDropdown';
import { NeuronModal } from '../ui/NeuronModal';
import { toast } from '../ui/toast-utils';
import {
  AssignmentProfileEditor,
  type AssignmentProfileEditorPayload,
} from '../shared/assignments/AssignmentProfileEditor';
import type { AssignmentProfile, AssignmentProfileItem } from '../../types/assignments';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPARTMENTS = ['Operations', 'Pricing', 'Business Development', 'Accounting'];
const SERVICE_TYPES = ['Forwarding', 'Brokerage', 'Trucking', 'Marine Insurance', 'Others'];

const DEPT_ICONS = {
  'Business Development': Briefcase,
  Operations:             Settings,
  Pricing:                Tag,
  Accounting:             BookOpen,
  HR:                     Users,
} as const;

const FORM_SPRING = { type: 'spring', stiffness: 420, damping: 42 } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileWithItems {
  profile: AssignmentProfile;
  items:   AssignmentProfileItem[];
}

interface CustomerAssignmentProfilesSectionProps {
  customerId: string;
  canEdit:    boolean;
}

// ─── Query ────────────────────────────────────────────────────────────────────

const QUERY_KEY = (customerId: string) => ['customer_assignment_profiles', customerId];

async function fetchCustomerProfiles(customerId: string): Promise<ProfileWithItems[]> {
  const { data: profiles, error } = await supabase
    .from('assignment_profiles')
    .select('*')
    .eq('subject_type', 'customer')
    .eq('subject_id', customerId)
    .eq('is_active', true)
    .order('department')
    .order('service_type');
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
    items: ((items ?? []) as AssignmentProfileItem[]).filter((i) => i.profile_id === p.id),
  }));
}

// ─── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  items,
  isFaded,
  isPendingDelete,
  onEdit,
  onDeleteRequest,
}: {
  profile:          AssignmentProfile;
  items:            AssignmentProfileItem[];
  isFaded:          boolean;
  isPendingDelete:  boolean;
  onEdit:           () => void;
  onDeleteRequest:  () => void;
}) {
  const subtitle = profile.service_type
    ? `${profile.department} · ${profile.service_type}`
    : profile.department;

  return (
    <div
      className={`group flex rounded-lg overflow-hidden transition-opacity duration-200 ${isFaded || isPendingDelete ? 'opacity-40' : 'opacity-100'}`}
      style={{ border: '1px solid var(--neuron-ui-border)', backgroundColor: 'var(--theme-bg-surface)' }}
    >
      {/* Service/scope metadata */}
      {profile.service_type && (
        <div
          className="w-44 shrink-0 px-4 py-3 flex flex-col justify-center gap-1.5"
          style={{ borderRight: '1px solid var(--neuron-ui-border)' }}
        >
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--neuron-ink-muted)' }}>
            Service
          </span>
          <span className="text-[12px]" style={{ color: 'var(--neuron-ink-primary)' }}>
            {profile.service_type}
          </span>
        </div>
      )}

      {/* Assignment columns */}
      <div className="flex-1 flex items-stretch min-w-0">
        {items.length === 0 ? (
          <p className="px-4 text-[12px] self-center italic" style={{ color: 'var(--theme-text-muted)' }}>
            No assignments saved.
          </p>
        ) : (
          items.map((item, i) => (
            <Fragment key={item.id}>
              {i > 0 && (
                <div className="w-px self-stretch shrink-0" style={{ backgroundColor: 'var(--neuron-ui-border)' }} />
              )}
              <div className="flex-1 px-4 py-3 min-w-[100px] overflow-hidden">
                <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--neuron-ink-muted)' }}>
                  {item.role_label}
                </p>
                <p className="text-[13px] truncate" style={{ color: 'var(--neuron-ink-primary)' }}>
                  {item.user_name}
                </p>
              </div>
            </Fragment>
          ))
        )}
      </div>

      {/* Actions (hover-revealed) */}
      {!isPendingDelete && (
        <div className="flex items-center gap-0.5 px-2 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
          <button
            onClick={onEdit}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title={`Edit ${subtitle} profile`}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--neuron-ui-border)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={onDeleteRequest}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Remove profile"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#C94F3D'; (e.currentTarget as HTMLElement).style.backgroundColor = '#FEF2F2'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-muted)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────

function ProfileForm({
  mode,
  customerId,
  userId,
  existingProfile,
  existingItems,
  usedScopeKeys,
  onSaved,
  onCancel,
}: {
  mode:              'add' | 'edit';
  customerId:        string;
  userId:            string;
  existingProfile?:  AssignmentProfile;
  existingItems?:    AssignmentProfileItem[];
  usedScopeKeys:     Set<string>;
  onSaved:           () => void;
  onCancel:          () => void;
}) {
  const [dept, setDept] = useState(existingProfile?.department ?? 'Operations');
  const [serviceType, setServiceType] = useState<string | null>(
    existingProfile?.service_type ?? 'Forwarding',
  );
  const [editorPayload, setEditorPayload] = useState<AssignmentProfileEditorPayload | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleDeptChange = (d: string) => {
    setDept(d);
    setServiceType(d === 'Operations' ? 'Forwarding' : null);
    setEditorPayload(null);
  };

  const scopeKey = `${dept}::${serviceType ?? ''}`;
  const scopeConflict = mode === 'add' && usedScopeKeys.has(scopeKey);

  const handleSave = async () => {
    if (!editorPayload || editorPayload.items.length === 0) {
      toast.error('Add at least one person');
      return;
    }
    if (scopeConflict) {
      toast.error('A profile for this department / service already exists');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.rpc('replace_assignment_profile_atomic', {
        p_subject_type: 'customer',
        p_subject_id:   customerId,
        p_customer_id:  customerId,
        p_department:   dept,
        p_service_type: serviceType ?? null,
        p_scope_kind:   'default',
        p_team_id:      editorPayload.teamId ?? null,
        p_assignments:  editorPayload.items,
        p_updated_by:   userId,
      });
      if (error) throw error;
      toast.success(mode === 'add' ? 'Profile created' : 'Profile updated');
      onSaved();
    } catch (err) {
      console.error('ProfileForm.save', err);
      toast.error('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const initialItems = existingItems?.map((i) => ({
    role_key:   i.role_key,
    role_label: i.role_label,
    user_id:    i.user_id,
    user_name:  i.user_name,
  })) ?? [];

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{ border: '1px solid var(--neuron-ui-border)', backgroundColor: 'var(--theme-bg-surface)' }}
    >
      <p className="text-[13px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
        {mode === 'add' ? 'Add Assignment Profile' : 'Edit Profile'}
      </p>

      {/* Dept + service selectors (read-only on edit) */}
      <div className={`grid gap-3 ${dept === 'Operations' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <CustomDropdown
          label="Department"
          value={dept}
          options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          onChange={mode === 'add' ? handleDeptChange : () => undefined}
          disabled={mode === 'edit'}
          fullWidth
        />
        {dept === 'Operations' && (
          <CustomDropdown
            label="Service Type"
            value={serviceType ?? ''}
            options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
            onChange={mode === 'add' ? (v) => setServiceType(v || null) : () => undefined}
            disabled={mode === 'edit'}
            fullWidth
          />
        )}
      </div>

      {scopeConflict && (
        <p className="text-[12px]" style={{ color: '#C94F3D' }}>
          A profile for this department / service already exists. Edit the existing one instead.
        </p>
      )}

      <div style={{ borderTop: '1px solid var(--neuron-ui-border)', paddingTop: '16px' }}>
        <AssignmentProfileEditor
          department={dept}
          serviceType={serviceType}
          initialTeamId={existingProfile?.team_id ?? null}
          initialItems={initialItems}
          onChange={setEditorPayload}
        />
      </div>

      <div
        className="flex items-center justify-between pt-1"
        style={{ borderTop: '1px solid var(--neuron-ui-border)' }}
      >
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
          style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--neuron-ui-border)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || scopeConflict}
          className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity"
          style={{ backgroundColor: 'var(--theme-action-primary-bg)', opacity: (isSaving || scopeConflict) ? 0.5 : 1 }}
        >
          {isSaving ? 'Saving…' : mode === 'add' ? 'Save Profile' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function CustomerAssignmentProfilesSection({
  customerId,
  canEdit,
}: CustomerAssignmentProfilesSectionProps) {
  const { user } = useUser();
  const qc = useQueryClient();

  const [isAdding, setIsAdding]           = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ProfileWithItems[]>({
    queryKey: QUERY_KEY(customerId),
    enabled:  !!customerId,
    queryFn:  () => fetchCustomerProfiles(customerId),
  });

  const profiles = data ?? [];
  const usedScopeKeys = new Set(
    profiles.map((p) => `${p.profile.department}::${p.profile.service_type ?? ''}`),
  );
  const profileToDelete = profiles.find((p) => p.profile.id === confirmDeleteId);

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY(customerId) });

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      const { error } = await supabase
        .from('assignment_profiles')
        .update({ is_active: false, updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
      toast.success('Profile removed');
      await invalidate();
    } catch {
      toast.error('Failed to remove profile');
    } finally {
      setDeletingId(null);
    }
  };

  // Group by department
  const grouped = profiles
    .sort((a, b) => {
      const dc = a.profile.department.localeCompare(b.profile.department);
      return dc !== 0 ? dc : (a.profile.service_type ?? '').localeCompare(b.profile.service_type ?? '');
    })
    .reduce<Record<string, ProfileWithItems[]>>((acc, p) => {
      (acc[p.profile.department] ??= []).push(p);
      return acc;
    }, {});
  const deptNames = Object.keys(grouped);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8" style={{ color: 'var(--theme-text-muted)' }}>
        <Users size={16} />
        <span className="text-[13px]">Loading assignment profiles…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
            Assignment Profiles
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
            Pre-assigned team members per department and service. Used to auto-fill roles on bookings and projects.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setIsAdding(true); setEditingId(null); }}
            disabled={isAdding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white transition-opacity"
            style={{ backgroundColor: 'var(--theme-action-primary-bg)', opacity: isAdding ? 0.4 : 1 }}
          >
            <Plus size={14} />
            Add Profile
          </button>
        )}
      </div>

      {/* Inline add form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={FORM_SPRING}
            style={{ overflow: 'hidden' }}
          >
            <ProfileForm
              mode="add"
              customerId={customerId}
              userId={user?.id ?? ''}
              usedScopeKeys={usedScopeKeys}
              onSaved={async () => { setIsAdding(false); await invalidate(); }}
              onCancel={() => setIsAdding(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {profiles.length === 0 && !isAdding && (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-lg text-center"
          style={{ border: '1px dashed var(--neuron-ui-border)' }}
        >
          <Users size={32} color="var(--theme-text-muted)" className="mb-3" />
          <p className="text-[13px] font-medium" style={{ color: 'var(--neuron-ink-primary)' }}>
            No assignment profiles yet
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>
            {canEdit
              ? "Add a profile to pre-assign team members to this customer's work."
              : 'Profiles will appear here once added.'}
          </p>
        </div>
      )}

      {/* Profile list grouped by department */}
      {profiles.length > 0 && (
        <div className="space-y-5">
          {deptNames.map((dept) => {
            const DeptIcon = DEPT_ICONS[dept as keyof typeof DEPT_ICONS] ?? Building2;
            return (
              <div key={dept} className="space-y-2">
                <div className="flex items-center gap-2">
                  <DeptIcon size={13} style={{ color: 'var(--theme-action-primary-bg)' }} />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-widest shrink-0"
                    style={{ color: 'var(--theme-action-primary-bg)' }}
                  >
                    {dept}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--neuron-ui-border)' }} />
                </div>

                {grouped[dept].map(({ profile, items }) => (
                  <AnimatePresence key={profile.id} mode="wait">
                    {editingId === profile.id ? (
                      <motion.div
                        key="edit"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <ProfileForm
                          mode="edit"
                          customerId={customerId}
                          userId={user?.id ?? ''}
                          existingProfile={profile}
                          existingItems={items}
                          usedScopeKeys={usedScopeKeys}
                          onSaved={async () => { setEditingId(null); await invalidate(); }}
                          onCancel={() => setEditingId(null)}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="card"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                      >
                        <ProfileCard
                          profile={profile}
                          items={items}
                          isFaded={!!editingId && editingId !== profile.id}
                          isPendingDelete={deletingId === profile.id}
                          onEdit={() => { setEditingId(profile.id); setIsAdding(false); }}
                          onDeleteRequest={() => setConfirmDeleteId(profile.id)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <NeuronModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Remove assignment profile?"
        description={
          profileToDelete
            ? `The ${profileToDelete.profile.department}${profileToDelete.profile.service_type ? ` · ${profileToDelete.profile.service_type}` : ''} profile will be removed. Existing bookings won't be affected.`
            : 'This profile will be removed.'
        }
        confirmLabel="Remove Profile"
        confirmIcon={<Trash2 size={14} />}
        onConfirm={handleDelete}
        isLoading={!!deletingId}
        variant="danger"
      />
    </div>
  );
}
