import { describe, it, expect } from 'vitest';
import { normalizeRoleKey } from './normalizeRoleKey';
import { projectAssignmentsToBooking } from './projectAssignmentsToBooking';
import {
  buildAssignmentVisibilityIndex,
  filterBookingsByScope,
} from './applyAssignmentVisibility';

// ─── normalizeRoleKey ────────────────────────────────────────────────────────

describe('normalizeRoleKey', () => {
  it('lowercases and snake-cases simple labels', () => {
    expect(normalizeRoleKey('Customs Declarant')).toBe('customs_declarant');
    expect(normalizeRoleKey('Operations Supervisor')).toBe('operations_supervisor');
    expect(normalizeRoleKey('Team Leader')).toBe('team_leader');
    expect(normalizeRoleKey('Handler')).toBe('handler');
  });

  it('strips punctuation and collapses underscores', () => {
    expect(normalizeRoleKey('Team Leader (PH)')).toBe('team_leader_ph');
    expect(normalizeRoleKey('CFO / Director')).toBe('cfo_director');
    expect(normalizeRoleKey('Hello---World')).toBe('hello_world');
  });

  it('prefixes role_ when label starts with a digit', () => {
    expect(normalizeRoleKey('1st Mate')).toBe('role_1st_mate');
  });

  it('returns "role" for fully-stripped or empty input', () => {
    expect(normalizeRoleKey('')).toBe('role');
    expect(normalizeRoleKey('   ---   ')).toBe('role');
  });
});

// ─── projectAssignmentsToBooking ─────────────────────────────────────────────

describe('projectAssignmentsToBooking', () => {
  const baseInputs = (serviceType: string) => ({
    serviceType,
    serviceManager: { id: 'usr_mgr', name: 'Mgr' },
    teamPool: { id: 'team_1', name: 'PH Ops' },
  });

  it('Brokerage: team_leader projects to supervisor, customs_declarant to handler', () => {
    const result = projectAssignmentsToBooking({
      ...baseInputs('Brokerage'),
      assignments: [
        { role_key: 'impex_supervisor', role_label: 'ImpEx Supervisor', user_id: 'u_imp', user_name: 'Imp' },
        { role_key: 'team_leader', role_label: 'Team Leader', user_id: 'u_tl', user_name: 'Lead' },
        { role_key: 'customs_declarant', role_label: 'Customs Declarant', user_id: 'u_cd', user_name: 'Decl' },
      ],
    });
    expect(result.manager_id).toBe('usr_mgr');
    expect(result.supervisor_id).toBe('u_tl');
    expect(result.supervisor_name).toBe('Lead');
    expect(result.handler_id).toBe('u_cd');
    expect(result.handler_name).toBe('Decl');
    expect(result.team_id).toBe('team_1');
  });

  it('Brokerage: falls back to impex_supervisor when team_leader missing', () => {
    const result = projectAssignmentsToBooking({
      ...baseInputs('Forwarding'),
      assignments: [
        { role_key: 'impex_supervisor', role_label: 'ImpEx Supervisor', user_id: 'u_imp', user_name: 'Imp' },
        { role_key: 'customs_declarant', role_label: 'Customs Declarant', user_id: 'u_cd', user_name: 'Decl' },
      ],
    });
    expect(result.supervisor_id).toBe('u_imp');
    expect(result.handler_id).toBe('u_cd');
  });

  it('Trucking: operations_supervisor and handler project correctly', () => {
    const result = projectAssignmentsToBooking({
      ...baseInputs('Trucking'),
      assignments: [
        { role_key: 'operations_supervisor', role_label: 'Operations Supervisor', user_id: 'u_op', user_name: 'Op' },
        { role_key: 'handler', role_label: 'Handler', user_id: 'u_hd', user_name: 'Hand' },
      ],
    });
    expect(result.supervisor_id).toBe('u_op');
    expect(result.handler_id).toBe('u_hd');
  });

  it('manager always projects from service-level default, not from any assignment row', () => {
    const result = projectAssignmentsToBooking({
      ...baseInputs('Trucking'),
      assignments: [
        // Note: a stray "manager" role_key is intentionally ignored — manager
        // is not a per-booking role in the new model.
        { role_key: 'manager', role_label: 'Manager', user_id: 'u_x', user_name: 'X' },
        { role_key: 'handler', role_label: 'Handler', user_id: 'u_hd', user_name: 'Hand' },
      ],
    });
    expect(result.manager_id).toBe('usr_mgr');
    expect(result.manager_name).toBe('Mgr');
    expect(result.handler_id).toBe('u_hd');
  });

  it('returns nulls when the service has no manager and no assignments', () => {
    const result = projectAssignmentsToBooking({
      serviceType: 'Others',
      serviceManager: null,
      teamPool: null,
      assignments: [],
    });
    expect(result.manager_id).toBeNull();
    expect(result.supervisor_id).toBeNull();
    expect(result.handler_id).toBeNull();
    expect(result.team_id).toBeNull();
  });

  it('Marine Insurance and Others use the trucking-style mapping', () => {
    for (const svc of ['Marine Insurance', 'Others']) {
      const result = projectAssignmentsToBooking({
        ...baseInputs(svc),
        assignments: [
          { role_key: 'operations_supervisor', role_label: 'Operations Supervisor', user_id: 'u_op', user_name: 'Op' },
          { role_key: 'handler', role_label: 'Handler', user_id: 'u_hd', user_name: 'Hand' },
        ],
      });
      expect(result.supervisor_id, `${svc} supervisor`).toBe('u_op');
      expect(result.handler_id, `${svc} handler`).toBe('u_hd');
    }
  });
});

// ─── filterBookingsByScope ───────────────────────────────────────────────────

describe('filterBookingsByScope', () => {
  type B = {
    bookingId: string;
    created_by?: string;
    manager_id?: string;
    supervisor_id?: string;
    handler_id?: string;
  };

  const bookings: B[] = [
    { bookingId: 'B1', created_by: 'creator', manager_id: 'mgr_a' },
    { bookingId: 'B2', supervisor_id: 'sup_b' },
    { bookingId: 'B3', handler_id: 'hdl_c' },
    // B4 has no legacy IDs at all — visibility comes from booking_assignments only.
    { bookingId: 'B4' },
  ];

  const index = buildAssignmentVisibilityIndex([
    { booking_id: 'B4', user_id: 'staff_x' },
    { booking_id: 'B2', user_id: 'staff_y' },
  ]);

  it('all-scope returns every row regardless of index', () => {
    const result = filterBookingsByScope(bookings, { type: 'all' }, index);
    expect(result).toHaveLength(4);
  });

  it('own-scope: assignment-only access (B4) shows up for the assigned user', () => {
    const result = filterBookingsByScope(
      bookings,
      { type: 'own', userId: 'staff_x' },
      index,
    );
    expect(result.map((b) => b.bookingId)).toEqual(['B4']);
  });

  it('own-scope: legacy-column access still works (creator)', () => {
    const result = filterBookingsByScope(
      bookings,
      { type: 'own', userId: 'creator' },
      index,
    );
    expect(result.map((b) => b.bookingId)).toEqual(['B1']);
  });

  it('own-scope: a user with no associations sees nothing', () => {
    const result = filterBookingsByScope(
      bookings,
      { type: 'own', userId: 'nobody' },
      index,
    );
    expect(result).toHaveLength(0);
  });

  it('userIds-scope: combines legacy and assignment hits', () => {
    const result = filterBookingsByScope(
      bookings,
      { type: 'userIds', ids: ['mgr_a', 'staff_y'] },
      index,
    );
    expect(result.map((b) => b.bookingId).sort()).toEqual(['B1', 'B2']);
  });

  it('empty index degrades gracefully to legacy-only filter', () => {
    const empty = buildAssignmentVisibilityIndex([]);
    const result = filterBookingsByScope(
      bookings,
      { type: 'own', userId: 'staff_x' },
      empty,
    );
    expect(result).toHaveLength(0);
  });
});
