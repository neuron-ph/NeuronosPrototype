/**
 * CustomerAssignmentDefaultsTab — V1 customer-side assignment defaults.
 *
 * Reads/writes the new assignment_default_profiles + assignment_default_items
 * tables. One default per service per customer. For consignee/shipper-level
 * defaults, see the trade-party page (separate surface).
 *
 * The legacy customer_team_profiles still ships in CustomerTeamsTab and serves
 * as a read-only fallback when the new tables are empty.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { useUser } from '../../hooks/useUser';
import { CustomDropdown } from './CustomDropdown';
import { NeuronModal } from '../ui/NeuronModal';
import { toast } from '../ui/toast-utils';
import {
  ServiceRoleAssignmentForm,
  type ServiceRoleAssignmentPayload,
} from '../operations/assignments/ServiceRoleAssignmentForm';
import { saveAssignmentsAsDefault } from '../../utils/assignments/persistBookingAssignments';
import { queryKeys } from '../../lib/queryKeys';
import type {
  AssignmentDefaultItem,
  AssignmentDefaultProfile,
} from '../../types/assignments';

const SERVICE_TYPES = ['Forwarding', 'Brokerage', 'Trucking', 'Marine Insurance', 'Others'];

interface CustomerAssignmentDefaultsTabProps {
  customerId: string;
  canEdit: boolean;
}

interface ProfileWithItems {
  profile: AssignmentDefaultProfile;
  items: AssignmentDefaultItem[];
}

export function CustomerAssignmentDefaultsTab({
  customerId,
  canEdit,
}: CustomerAssignmentDefaultsTabProps) {
  const { user } = useUser();
  const qc = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingServiceType, setEditingServiceType] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<ProfileWithItems[]>({
    queryKey: queryKeys.assignments.defaultsForCustomer(customerId),
    enabled: !!customerId,
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('assignment_default_profiles')
        .select('*')
        .eq('subject_type', 'customer')
        .eq('subject_id', customerId)
        .eq('is_active', true)
        .order('service_type');
      if (error) throw error;
      const profileList = (profiles ?? []) as AssignmentDefaultProfile[];
      if (profileList.length === 0) return [];
      const ids = profileList.map((p) => p.id);
      const { data: items } = await supabase
        .from('assignment_default_items')
        .select('*')
        .in('profile_id', ids)
        .order('sort_order');
      const grouped: ProfileWithItems[] = profileList.map((p) => ({
        profile: p,
        items: (items ?? []).filter((i) => i.profile_id === p.id) as AssignmentDefaultItem[],
      }));
      return grouped;
    },
  });

  const profilesByService = new Map((data ?? []).map((p) => [p.profile.service_type, p]));
  const usedServiceTypes = new Set((data ?? []).map((p) => p.profile.service_type));
  const availableServiceTypes = SERVICE_TYPES.filter((s) => !usedServiceTypes.has(s));

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      const { error } = await supabase
        .from('assignment_default_profiles')
        .update({ is_active: false, updated_by: user?.id ?? null })
        .eq('id', confirmDeleteId);
      if (error) throw error;
      toast.success('Default removed');
      setConfirmDeleteId(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: queryKeys.assignments.all() });
    } catch (err) {
      console.error('CustomerAssignmentDefaultsTab.delete', err);
      toast.error('Failed to remove default');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8" style={{ color: 'var(--theme-text-muted)' }}>
        <Users size={16} />
        <span className="text-[13px]">Loading assignment defaults…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
            Assignment Defaults
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
            Pre-fills role assignments on bookings created for this customer. One default per service.
          </p>
        </div>
        {canEdit && availableServiceTypes.length > 0 && (
          <button
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white"
            style={{ backgroundColor: 'var(--theme-action-primary-bg)', opacity: isAdding ? 0.4 : 1 }}
          >
            <Plus size={14} />
            Add Default
          </button>
        )}
      </div>

      {isAdding && (
        <AddOrEditDefault
          mode="add"
          customerId={customerId}
          availableServiceTypes={availableServiceTypes}
          userId={user?.id ?? null}
          onCancel={() => setIsAdding(false)}
          onSaved={async () => {
            setIsAdding(false);
            await refetch();
            await qc.invalidateQueries({ queryKey: queryKeys.assignments.all() });
          }}
        />
      )}

      {(data ?? []).length === 0 && !isAdding && (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-lg text-center"
          style={{ border: '1px dashed var(--neuron-ui-border)' }}
        >
          <Users size={32} color="var(--theme-text-muted)" className="mb-3" />
          <p className="text-[13px] font-medium" style={{ color: 'var(--neuron-ink-primary)' }}>
            No assignment defaults yet
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>
            {canEdit ? 'Add a default to pre-fill roles on this customer’s bookings.' : 'Defaults will appear here once added.'}
          </p>
        </div>
      )}

      {(data ?? []).length > 0 && (
        <div className="space-y-3">
          {(data ?? []).map(({ profile, items }) => {
            const isEditing = editingServiceType === profile.service_type;
            return (
              <div
                key={profile.id}
                className="rounded-lg overflow-hidden"
                style={{
                  border: '1px solid var(--neuron-ui-border)',
                  backgroundColor: 'var(--theme-bg-surface)',
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-2"
                  style={{ borderBottom: '1px solid var(--neuron-ui-border)' }}
                >
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
                    {profile.service_type}
                  </span>
                  {canEdit && !isEditing && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingServiceType(profile.service_type)}
                        className="p-1.5 rounded"
                        style={{ color: 'var(--theme-text-muted)' }}
                        title="Edit default"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(profile.id)}
                        className="p-1.5 rounded"
                        style={{ color: 'var(--theme-text-muted)' }}
                        title="Remove default"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="p-4">
                    <AddOrEditDefault
                      mode="edit"
                      customerId={customerId}
                      profile={profile}
                      items={items}
                      availableServiceTypes={[profile.service_type]}
                      userId={user?.id ?? null}
                      onCancel={() => setEditingServiceType(null)}
                      onSaved={async () => {
                        setEditingServiceType(null);
                        await refetch();
                        await qc.invalidateQueries({ queryKey: queryKeys.assignments.all() });
                      }}
                    />
                  </div>
                ) : items.length === 0 ? (
                  <p className="px-4 py-3 text-[12px] italic" style={{ color: 'var(--theme-text-muted)' }}>
                    No assignments saved.
                  </p>
                ) : (
                  <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {items.map((item) => (
                      <div key={item.id}>
                        <p
                          className="text-[10px] font-medium uppercase tracking-wide"
                          style={{ color: 'var(--neuron-ink-muted)' }}
                        >
                          {item.role_label}
                        </p>
                        <p className="text-[13px] truncate" style={{ color: 'var(--neuron-ink-primary)' }}>
                          {item.user_name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NeuronModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Remove assignment default?"
        description="The default will be deactivated. New bookings for this customer will fall back to the service default."
        confirmLabel="Remove"
        confirmIcon={<Trash2 size={14} />}
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}

interface AddOrEditDefaultProps {
  mode: 'add' | 'edit';
  customerId: string;
  profile?: AssignmentDefaultProfile;
  items?: AssignmentDefaultItem[];
  availableServiceTypes: string[];
  userId: string | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function AddOrEditDefault({
  mode,
  customerId,
  profile,
  items,
  availableServiceTypes,
  userId,
  onCancel,
  onSaved,
}: AddOrEditDefaultProps) {
  const [serviceType, setServiceType] = useState<string>(
    profile?.service_type ?? availableServiceTypes[0] ?? '',
  );
  const [payload, setPayload] = useState<ServiceRoleAssignmentPayload | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initial =
    items?.map((it) => ({
      role_key: it.role_key,
      role_label: it.role_label,
      user_id: it.user_id,
      user_name: it.user_name,
    })) ?? [];

  const handleSave = async () => {
    if (!serviceType || !payload) {
      toast.error('Pick a service first');
      return;
    }
    if (payload.assignments.length === 0) {
      toast.error('Add at least one user');
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveAssignmentsAsDefault({
        subjectType: 'customer',
        subjectId: customerId,
        customerId,
        serviceType,
        teamId: payload.teamPool.id,
        assignments: payload.assignments,
        updatedBy: userId,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(mode === 'add' ? 'Default created' : 'Default updated');
      await onSaved();
    } catch (err) {
      console.error('AddOrEditDefault.save', err);
      toast.error('Failed to save default');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg p-4 space-y-4 border" style={{ borderColor: 'var(--neuron-ui-border)', backgroundColor: 'var(--theme-bg-surface)' }}>
      {mode === 'add' && (
        <CustomDropdown
          label="Service"
          value={serviceType}
          onChange={setServiceType}
          options={availableServiceTypes.map((s) => ({ value: s, label: s }))}
          fullWidth
        />
      )}

      <ServiceRoleAssignmentForm
        customerId={customerId}
        serviceType={serviceType}
        initialAssignments={initial}
        initialTeamId={profile?.team_id ?? null}
        hideSaveAsDefault
        onChange={setPayload}
      />

      <div className="flex items-center justify-end gap-2 pt-1" style={{ borderTop: '1px solid var(--neuron-ui-border)' }}>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium"
          style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--neuron-ui-border)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium text-white"
          style={{ backgroundColor: 'var(--theme-action-primary-bg)', opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? 'Saving…' : mode === 'add' ? 'Save Default' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
