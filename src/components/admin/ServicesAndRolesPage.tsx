/**
 * Executive admin: Services & Roles.
 *
 * One card per operational service.
 *   • Set/change Service Manager (operational_services.default_manager_id)
 *   • Add / edit / deactivate / reorder service_assignment_roles per service
 *   • Generated role_key from label, with collision warning when role is in use
 *
 * Reads/writes operational_services + service_assignment_roles via supabase.from().
 * RLS limits writes to Executive department / role.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Save, X, Trash2, ArrowUp, ArrowDown, AlertTriangle, Users } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { CustomDropdown } from '../bd/CustomDropdown';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { toast } from '../ui/toast-utils';
import { NeuronModal } from '../ui/NeuronModal';
import { normalizeRoleKey } from '../../utils/assignments/normalizeRoleKey';
import { queryKeys } from '../../lib/queryKeys';
import { useUser } from '../../hooks/useUser';
import type {
  OperationalService,
  ServiceAssignmentRole,
} from '../../types/assignments';

interface ManagerOption {
  id: string;
  name: string;
}

export function ServicesAndRolesPage() {
  const { user } = useUser();
  const isExec = user?.department === 'Executive' || user?.role === 'executive';
  const qc = useQueryClient();

  const { data: services = [] } = useQuery<OperationalService[]>({
    queryKey: queryKeys.assignments.services(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_services')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as OperationalService[];
    },
  });

  const { data: rolesByService = {} } = useQuery<Record<string, ServiceAssignmentRole[]>>({
    queryKey: queryKeys.assignments.rolesForService('__all__'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_assignment_roles')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      const grouped: Record<string, ServiceAssignmentRole[]> = {};
      for (const r of (data ?? []) as ServiceAssignmentRole[]) {
        (grouped[r.service_type] ??= []).push(r);
      }
      return grouped;
    },
  });

  const { data: managers = [] } = useQuery<ManagerOption[]>({
    queryKey: ['admin', 'services-roles', 'managers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('department', 'Operations')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ManagerOption[];
    },
  });

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.assignments.all() });
  };

  return (
    <div>
      <p className="text-[13px] mb-4" style={{ color: 'var(--theme-text-muted)' }}>
        Configure each operational service&apos;s Service Manager and assignment role slots.
        {!isExec ? ' (Read-only — Executive permissions required to edit.)' : ''}
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        {services.map((svc) => (
          <ServiceCard
            key={svc.id}
            service={svc}
            roles={rolesByService[svc.service_type] ?? []}
            managers={managers}
            canEdit={isExec}
            onChanged={refreshAll}
          />
        ))}
      </div>
    </div>
  );
}

interface ServiceCardProps {
  service: OperationalService;
  roles: ServiceAssignmentRole[];
  managers: ManagerOption[];
  canEdit: boolean;
  onChanged: () => Promise<void>;
}

function ServiceCard({ service, roles, managers, canEdit, onChanged }: ServiceCardProps) {
  const [isEditingManager, setIsEditingManager] = useState(false);
  const [pendingManagerId, setPendingManagerId] = useState<string>(service.default_manager_id ?? '');
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleRequired, setNewRoleRequired] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  useEffect(() => {
    setPendingManagerId(service.default_manager_id ?? '');
  }, [service.default_manager_id]);

  const activeRoles = roles.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const usedKeys = useMemo(() => new Set(activeRoles.map((r) => r.role_key)), [activeRoles]);

  const handleSaveManager = async () => {
    const m = managers.find((u) => u.id === pendingManagerId);
    const { error } = await supabase
      .from('operational_services')
      .update({
        default_manager_id: pendingManagerId || null,
        default_manager_name: m?.name ?? null,
      })
      .eq('id', service.id);
    if (error) {
      toast.error('Failed to update service manager');
      return;
    }
    toast.success('Service manager updated');
    setIsEditingManager(false);
    await onChanged();
  };

  const handleAddRole = async () => {
    if (!newRoleLabel.trim()) {
      toast.error('Enter a role label');
      return;
    }
    const role_key = normalizeRoleKey(newRoleLabel);
    if (usedKeys.has(role_key)) {
      toast.error('That role already exists for this service');
      return;
    }
    const sort_order = activeRoles.length === 0 ? 10 : Math.max(...activeRoles.map((r) => r.sort_order)) + 10;
    const { error } = await supabase.from('service_assignment_roles').insert({
      service_type: service.service_type,
      role_key,
      role_label: newRoleLabel.trim(),
      required: newRoleRequired,
      allow_multiple: false,
      sort_order,
      is_active: true,
    });
    if (error) {
      toast.error(`Failed to add role: ${error.message}`);
      return;
    }
    toast.success('Role added');
    setNewRoleLabel('');
    setNewRoleRequired(false);
    setIsAddingRole(false);
    await onChanged();
  };

  const handleSaveRole = async (id: string, patch: Partial<ServiceAssignmentRole>) => {
    const { error } = await supabase.from('service_assignment_roles').update(patch).eq('id', id);
    if (error) {
      toast.error(`Failed to update role: ${error.message}`);
      return;
    }
    toast.success('Role updated');
    setEditingRoleId(null);
    await onChanged();
  };

  const handleMove = async (id: string, direction: -1 | 1) => {
    const idx = activeRoles.findIndex((r) => r.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= activeRoles.length) return;
    const a = activeRoles[idx];
    const b = activeRoles[swapIdx];
    await supabase
      .from('service_assignment_roles')
      .update({ sort_order: b.sort_order })
      .eq('id', a.id);
    await supabase
      .from('service_assignment_roles')
      .update({ sort_order: a.sort_order })
      .eq('id', b.id);
    await onChanged();
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivateId) return;
    const { error } = await supabase
      .from('service_assignment_roles')
      .update({ is_active: false })
      .eq('id', confirmDeactivateId);
    if (error) {
      toast.error('Failed to deactivate role');
      return;
    }
    toast.success('Role deactivated');
    setConfirmDeactivateId(null);
    await onChanged();
  };

  return (
    <div
      className="rounded-lg p-4"
      style={{ border: '1px solid var(--neuron-ui-border)', backgroundColor: 'var(--theme-bg-surface)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: 'var(--theme-action-primary-bg)' }} />
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--neuron-ink-primary)' }}>
            {service.label}
          </h2>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
          {service.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Service Manager */}
      <div className="mb-4 rounded-md p-3" style={{ background: 'var(--theme-bg-page)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--neuron-ink-muted)' }}>
            Service Manager
          </span>
          {canEdit && !isEditingManager && (
            <button
              className="text-[12px] px-2 py-0.5 rounded"
              style={{ color: 'var(--theme-action-primary-bg)' }}
              onClick={() => setIsEditingManager(true)}
            >
              <Edit2 size={12} className="inline mr-1" />
              edit
            </button>
          )}
        </div>
        {isEditingManager ? (
          <div className="flex items-center gap-2">
            <CustomDropdown
              value={pendingManagerId}
              onChange={setPendingManagerId}
              options={[{ value: '', label: '— No manager —' }, ...managers.map((m) => ({ value: m.id, label: m.name }))]}
              placeholder="Select manager…"
              fullWidth
            />
            <button onClick={handleSaveManager} className="p-1.5 rounded text-white" style={{ backgroundColor: 'var(--theme-action-primary-bg)' }}>
              <Save size={14} />
            </button>
            <button onClick={() => setIsEditingManager(false)} className="p-1.5 rounded" style={{ color: 'var(--theme-text-muted)' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="text-[14px]" style={{ color: service.default_manager_name ? 'var(--neuron-ink-primary)' : 'var(--theme-text-muted)' }}>
            {service.default_manager_name ?? 'No service manager set'}
          </div>
        )}
      </div>

      {/* Assignment Roles */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--neuron-ink-muted)' }}>
            Assignment Roles
          </span>
          {canEdit && !isAddingRole && (
            <button
              onClick={() => setIsAddingRole(true)}
              className="text-[12px] px-2 py-0.5 rounded flex items-center gap-1"
              style={{ color: 'var(--theme-action-primary-bg)' }}
            >
              <Plus size={12} />
              add role
            </button>
          )}
        </div>

        {isAddingRole && (
          <div className="rounded-md p-3 mb-3 space-y-2" style={{ border: '1px dashed var(--neuron-ui-border)' }}>
            <Input
              placeholder="Role label (e.g. Customs Declarant)"
              value={newRoleLabel}
              onChange={(e) => setNewRoleLabel(e.target.value)}
            />
            <div className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
              Generated key: <code>{newRoleLabel ? normalizeRoleKey(newRoleLabel) : '—'}</code>
              {newRoleLabel && usedKeys.has(normalizeRoleKey(newRoleLabel)) && (
                <span className="ml-2 text-red-600">already in use</span>
              )}
            </div>
            <label className="flex items-center gap-2 text-[12px]">
              <Checkbox checked={newRoleRequired} onCheckedChange={(c) => setNewRoleRequired(c === true)} />
              Required
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setIsAddingRole(false);
                  setNewRoleLabel('');
                  setNewRoleRequired(false);
                }}
                className="px-3 py-1 rounded text-[12px]"
                style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--neuron-ui-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddRole}
                className="px-3 py-1 rounded text-[12px] text-white"
                style={{ backgroundColor: 'var(--theme-action-primary-bg)' }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {activeRoles.length === 0 && !isAddingRole && (
            <p className="text-[12px] italic" style={{ color: 'var(--theme-text-muted)' }}>
              No roles configured.
            </p>
          )}
          {activeRoles.map((role, idx) => (
            <RoleRow
              key={role.id}
              role={role}
              isFirst={idx === 0}
              isLast={idx === activeRoles.length - 1}
              isEditing={editingRoleId === role.id}
              canEdit={canEdit}
              onStartEdit={() => setEditingRoleId(role.id)}
              onCancelEdit={() => setEditingRoleId(null)}
              onSave={(patch) => handleSaveRole(role.id, patch)}
              onMoveUp={() => handleMove(role.id, -1)}
              onMoveDown={() => handleMove(role.id, 1)}
              onDeactivate={() => setConfirmDeactivateId(role.id)}
            />
          ))}
        </div>
      </div>

      <NeuronModal
        isOpen={!!confirmDeactivateId}
        onClose={() => setConfirmDeactivateId(null)}
        title="Deactivate role?"
        description="Existing bookings still display this role. New bookings will not allow assigning to it."
        confirmLabel="Deactivate"
        confirmIcon={<Trash2 size={14} />}
        onConfirm={handleDeactivate}
        variant="danger"
      />
    </div>
  );
}

interface RoleRowProps {
  role: ServiceAssignmentRole;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  canEdit: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<ServiceAssignmentRole>) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDeactivate: () => void;
}

function RoleRow({
  role,
  isFirst,
  isLast,
  isEditing,
  canEdit,
  onStartEdit,
  onCancelEdit,
  onSave,
  onMoveUp,
  onMoveDown,
  onDeactivate,
}: RoleRowProps) {
  const [label, setLabel] = useState(role.role_label);
  const [required, setRequired] = useState(role.required);

  useEffect(() => {
    setLabel(role.role_label);
    setRequired(role.required);
  }, [role.role_label, role.required, isEditing]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ border: '1px solid var(--theme-action-primary-bg)' }}>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-7 text-[13px]" />
        <label className="flex items-center gap-1 text-[11px]">
          <Checkbox checked={required} onCheckedChange={(c) => setRequired(c === true)} />
          required
        </label>
        <button
          onClick={() => onSave({ role_label: label, required })}
          className="p-1 rounded text-white"
          style={{ backgroundColor: 'var(--theme-action-primary-bg)' }}
          title="Save"
        >
          <Save size={12} />
        </button>
        <button onClick={onCancelEdit} className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Cancel">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded"
      style={{ background: 'var(--theme-bg-page)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium" style={{ color: 'var(--neuron-ink-primary)' }}>
            {role.role_label}
          </span>
          {role.required && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(15, 118, 110, 0.08)', color: 'var(--theme-action-primary-bg)' }}>
              required
            </span>
          )}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
          <code>{role.role_key}</code>
        </div>
      </div>
      {canEdit && (
        <>
          <button onClick={onMoveUp} disabled={isFirst} className="p-1 rounded disabled:opacity-30" style={{ color: 'var(--theme-text-muted)' }} title="Move up">
            <ArrowUp size={12} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-1 rounded disabled:opacity-30" style={{ color: 'var(--theme-text-muted)' }} title="Move down">
            <ArrowDown size={12} />
          </button>
          <button onClick={onStartEdit} className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Edit">
            <Edit2 size={12} />
          </button>
          <button onClick={onDeactivate} className="p-1 rounded" style={{ color: 'var(--theme-text-muted)' }} title="Deactivate">
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}
