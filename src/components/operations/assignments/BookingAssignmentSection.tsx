/**
 * BookingAssignmentSection — V1 replacement for BookingTeamSection.
 *
 * View mode: shows the resolved Service Manager + each role's assigned user.
 * Edit mode: renders ServiceRoleAssignmentForm and persists on save.
 *
 * Persistence (on save):
 *   1. Replace booking_assignments rows for this booking
 *   2. Update legacy {team,manager,supervisor,handler}_{id,name} projection on
 *      the bookings row (so older screens, dashboards, and reports stay in
 *      sync)
 *   3. Optionally save as customer / trade-party default
 *   4. Append activity log + fire workflow tickets for newly assigned users
 */

import { useEffect, useMemo, useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { EditableSectionCard } from '../../shared/EditableSectionCard';
import { ServiceRoleAssignmentForm, type ServiceRoleAssignmentPayload } from './ServiceRoleAssignmentForm';
import { toast } from '../../ui/toast-utils';
import { appendBookingActivity } from '../../../utils/bookingActivityLog';
import { fireBookingAssignmentTickets } from '../../../utils/workflowTickets';
import { recordNotificationEvent, operationsSubSectionFor } from '../../../utils/notifications';
import { useUser } from '../../../hooks/useUser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import {
  replaceBookingAssignments,
  saveAssignmentsAsDefault,
} from '../../../utils/assignments/persistBookingAssignments';
import { projectAssignmentsToBooking } from '../../../utils/assignments/projectAssignmentsToBooking';
import type { BookingAssignment, BookingAssignmentInput } from '../../../types/assignments';

interface BookingAssignmentSectionProps {
  bookingId: string;
  bookingNumber: string;
  serviceType: string;
  customerName: string;
  customerId?: string;
  teamId?: string | null;
  /** Trade-party profile id, if the booking has one (consignee/shipper). */
  tradePartyProfileId?: string | null;
  /** Legacy compatibility props — used only to fall back when assignments rows are absent. */
  managerName?: string;
  supervisorName?: string;
  handlerName?: string;
  handlerId?: string;
  currentUser?: { name: string; email: string; department: string } | null;
  onUpdate: () => void;
  addActivity?: (fieldName: string, oldValue: string, newValue: string) => void;
  sheet?: boolean;
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--neuron-ink-base)',
          marginBottom: '8px',
        }}
      >
        {label}
        <Lock size={12} color="var(--theme-text-muted)" />
      </label>
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'var(--theme-bg-page)',
          border: '1px solid var(--theme-border-default)',
          borderRadius: '6px',
          fontSize: '14px',
          color: value ? 'var(--neuron-ink-base)' : 'var(--theme-text-muted)',
        }}
      >
        {value || '—'}
      </div>
    </div>
  );
}

export function BookingAssignmentSection({
  bookingId,
  bookingNumber,
  serviceType,
  customerName,
  customerId,
  teamId,
  tradePartyProfileId,
  managerName,
  supervisorName,
  handlerName,
  handlerId,
  currentUser,
  onUpdate,
  addActivity,
  sheet = false,
}: BookingAssignmentSectionProps) {
  const { user } = useUser();
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<ServiceRoleAssignmentPayload | null>(null);

  // Load existing assignments for this booking.
  const { data: assignmentRows = [], isLoading } = useQuery<BookingAssignment[]>({
    queryKey: queryKeys.assignments.bookingAssignments(bookingId),
    enabled: !!bookingId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_assignments')
        .select('*')
        .eq('booking_id', bookingId);
      if (error) throw error;
      return (data ?? []) as BookingAssignment[];
    },
  });

  const initialAssignments: BookingAssignmentInput[] = useMemo(
    () =>
      assignmentRows.map((a) => ({
        role_key: a.role_key,
        role_label: a.role_label,
        user_id: a.user_id,
        user_name: a.user_name,
        source: a.source,
      })),
    [assignmentRows],
  );

  const handleSave = async () => {
    if (!pendingPayload) {
      setIsEditing(false);
      return;
    }
    if (pendingPayload.hasMissingRequired) {
      toast.error('Please fill in all required role assignments');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Replace booking_assignments and sync the legacy booking projection.
      const projection = projectAssignmentsToBooking({
        serviceType: pendingPayload.serviceType,
        assignments: pendingPayload.assignments,
        serviceManager: pendingPayload.service
          ? {
              id: pendingPayload.service.default_manager_id,
              name: pendingPayload.service.default_manager_name,
            }
          : null,
        teamPool: pendingPayload.teamPool,
      });

      const replaceRes = await replaceBookingAssignments({
        bookingId,
        serviceType: pendingPayload.serviceType,
        assignments: pendingPayload.assignments,
        assignedBy: user?.id ?? null,
        projection,
      });
      if (!replaceRes.ok) throw new Error(replaceRes.error);

      // 2. Save as default if requested.
      if (pendingPayload.saveAsDefault === 'customer' && customerId) {
        await saveAssignmentsAsDefault({
          subjectType: 'customer',
          subjectId: customerId,
          customerId,
          serviceType: pendingPayload.serviceType,
          teamId: pendingPayload.teamPool.id,
          assignments: pendingPayload.assignments,
          updatedBy: user?.id ?? null,
        });
      } else if (pendingPayload.saveAsDefault === 'trade_party' && tradePartyProfileId) {
        await saveAssignmentsAsDefault({
          subjectType: 'trade_party',
          subjectId: tradePartyProfileId,
          customerId: customerId ?? null,
          serviceType: pendingPayload.serviceType,
          teamId: pendingPayload.teamPool.id,
          assignments: pendingPayload.assignments,
          updatedBy: user?.id ?? null,
        });
      }

      // 3. Activity log + workflow tickets.
      const actorName = currentUser?.name || user?.name || 'User';
      const actorDept = currentUser?.department || user?.department || 'Operations';
      if (addActivity) {
        addActivity(
          'Assignments',
          summarizeAssignments(initialAssignments) || '(none)',
          summarizeAssignments(pendingPayload.assignments) || '(none)',
        );
      }
      appendBookingActivity(
        bookingId,
        {
          action: 'field_updated',
          fieldName: 'Assignments',
          oldValue: summarizeAssignments(initialAssignments) || '(unassigned)',
          newValue: summarizeAssignments(pendingPayload.assignments) || '(unassigned)',
          user: actorName,
        },
        { name: actorName, department: actorDept },
      );

      // Notify newly-assigned users (anyone not in the previous assignment set).
      const previousIds = new Set(initialAssignments.map((a) => a.user_id));
      const newlyAssigned = pendingPayload.assignments
        .map((a) => a.user_id)
        .filter((uid) => uid && !previousIds.has(uid));
      if (newlyAssigned.length > 0) {
        void recordNotificationEvent({
          actorUserId: user?.id ?? null,
          module: 'operations',
          subSection: operationsSubSectionFor(pendingPayload.serviceType),
          entityType: 'booking',
          entityId: bookingId,
          kind: 'assigned',
          summary: {
            label: `Assigned to ${pendingPayload.serviceType} booking${bookingNumber ? ` ${bookingNumber}` : ''}`,
            reference: bookingNumber ?? undefined,
            customer_name: customerName ?? undefined,
          },
          recipientIds: newlyAssigned,
        });
      }

      const newHandler = pendingPayload.assignments.find(
        (a) => a.role_key === 'handler' || a.role_key === 'customs_declarant',
      );
      if (user?.id && newHandler && newHandler.user_id !== handlerId) {
        void fireBookingAssignmentTickets({
          bookingId,
          bookingNumber,
          serviceType,
          customerName,
          createdBy: user.id,
          createdByName: actorName,
          createdByDept: actorDept,
          manager: pendingPayload.service?.default_manager_id
            ? {
                id: pendingPayload.service.default_manager_id,
                name: pendingPayload.service.default_manager_name ?? '',
              }
            : { id: '', name: '' },
          supervisor: extractSupervisor(pendingPayload),
          handler: { id: newHandler.user_id, name: newHandler.user_name },
        });
      }

      toast.success('Assignments saved');
      setIsEditing(false);
      setPendingPayload(null);
      await qc.invalidateQueries({
        queryKey: queryKeys.assignments.bookingAssignments(bookingId),
      });
      onUpdate();
    } catch (err) {
      console.error('BookingAssignmentSection save error:', err);
      toast.error('Failed to save assignments');
    } finally {
      setIsSaving(false);
    }
  };

  const hasAssignment = assignmentRows.length > 0 || managerName || supervisorName || handlerName;

  return (
    <EditableSectionCard
      title="Team Assignment"
      sheet={sheet}
      subtitle={!isEditing && !hasAssignment ? 'No assignments yet' : undefined}
      isEditing={isEditing}
      isSaving={isSaving}
      onEdit={() => {
        setPendingPayload(null);
        setIsEditing(true);
      }}
      onCancel={() => {
        setIsEditing(false);
        setPendingPayload(null);
      }}
      onSave={handleSave}
    >
      {isEditing ? (
        <ServiceRoleAssignmentForm
          customerId={customerId}
          tradePartyProfileId={tradePartyProfileId}
          serviceType={serviceType}
          initialAssignments={initialAssignments}
          initialTeamId={teamId}
          onChange={setPendingPayload}
        />
      ) : isLoading ? (
        <div style={{ padding: '12px 0', color: 'var(--theme-text-muted)', fontSize: '13px' }}>
          Loading assignments…
        </div>
      ) : !hasAssignment ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: 'var(--theme-bg-page)',
            border: '1px dashed var(--theme-border-default)',
            borderRadius: '6px',
            color: 'var(--theme-text-muted)',
            fontSize: '13px',
          }}
        >
          <Users size={16} color="var(--theme-text-muted)" />
          No assignments — this booking needs one before it can be handled.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Manager from legacy projection (always shown) */}
          {managerName ? <LockedField label="Service Manager" value={managerName} /> : null}
          {/* Each assignment role */}
          {assignmentRows.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              {assignmentRows
                .slice()
                .sort((a, b) => a.role_label.localeCompare(b.role_label))
                .map((a) => (
                  <LockedField key={a.id} label={a.role_label} value={a.user_name} />
                ))}
            </div>
          ) : (
            // Fall back to legacy projection columns if no booking_assignments rows yet.
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              {supervisorName ? <LockedField label="Supervisor" value={supervisorName} /> : null}
              {handlerName ? <LockedField label="Handler" value={handlerName} /> : null}
            </div>
          )}
        </div>
      )}
    </EditableSectionCard>
  );
}

function summarizeAssignments(items: BookingAssignmentInput[]): string {
  return items
    .filter((i) => i.user_name)
    .map((i) => `${i.role_label}: ${i.user_name}`)
    .join(' · ');
}

function extractSupervisor(payload: ServiceRoleAssignmentPayload): { id: string; name: string } | null {
  const supKey = ['team_leader', 'operations_supervisor', 'impex_supervisor'];
  const a = payload.assignments.find((x) => supKey.includes(x.role_key));
  if (!a) return null;
  return { id: a.user_id, name: a.user_name };
}
