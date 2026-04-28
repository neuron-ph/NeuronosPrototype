/**
 * WS8 Unit tests — canonical assignment profile resolver.
 *
 * Tests the pure logic layer of resolveAssignmentProfile:
 *   - buildBaseSlots
 *   - applyItemsToSlots
 *   - buildFreeformSlots
 *   - serviceProjection
 *   - applyAssignmentPrecedence (the 5-level precedence ladder)
 *
 * No Supabase calls — all IO is separated from logic.
 */

import { describe, it, expect } from 'vitest';
import {
  applyAssignmentPrecedence,
  applyItemsToSlots,
  buildBaseSlots,
  buildFreeformSlots,
  serviceProjection,
  type LoadedProfile,
} from './resolveAssignmentProfile';
import type { OperationalService, ServiceAssignmentRole } from '../../types/assignments';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const role = (role_key: string, role_label: string, required = false): ServiceAssignmentRole => ({
  id: `role_${role_key}`,
  service_type: 'Forwarding',
  role_key,
  role_label,
  required,
  allow_multiple: false,
  sort_order: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
});

const opsRoles: ServiceAssignmentRole[] = [
  role('impex_supervisor', 'ImpEx Supervisor', true),
  role('team_leader',      'Team Leader',      false),
  role('customs_declarant','Customs Declarant', true),
];

const service: OperationalService = {
  id:                   'svc_fwd',
  service_type:         'Forwarding',
  label:                'Forwarding',
  department:           'Operations',
  default_manager_id:   'mgr_1',
  default_manager_name: 'Alice Mgr',
  sort_order:           10,
  is_active:            true,
  created_at:           '',
  updated_at:           '',
};

const profile = (
  profileId: string,
  subjectType: LoadedProfile['subjectType'],
  scopeKind: LoadedProfile['scopeKind'],
  items: LoadedProfile['items'],
  teamPool: LoadedProfile['teamPool'] = { id: null, name: null },
): LoadedProfile => ({ profileId, subjectType, scopeKind, items, teamPool });

const item = (role_key: string, user_id: string, user_name: string, sort_order = 0) =>
  ({ role_key, role_label: role_key, user_id, user_name, sort_order });

// ─── buildBaseSlots ───────────────────────────────────────────────────────────

describe('buildBaseSlots', () => {
  it('returns one slot per role with null user fields', () => {
    const slots = buildBaseSlots(opsRoles);
    expect(slots).toHaveLength(3);
    expect(slots[0].role_key).toBe('impex_supervisor');
    expect(slots[0].user_id).toBeNull();
    expect(slots[0].user_name).toBeNull();
    expect(slots[0].required).toBe(true);
  });

  it('returns empty array when no roles defined', () => {
    expect(buildBaseSlots([])).toEqual([]);
  });

  it('preserves required and allow_multiple flags from the role catalog', () => {
    const roles = [
      role('handler', 'Handler', true),
      role('assistant', 'Assistant', false),
    ];
    const slots = buildBaseSlots(roles);
    expect(slots[0].required).toBe(true);
    expect(slots[1].required).toBe(false);
  });
});

// ─── applyItemsToSlots ────────────────────────────────────────────────────────

describe('applyItemsToSlots', () => {
  const base = buildBaseSlots(opsRoles);

  it('fills matching slots with user data', () => {
    const filled = applyItemsToSlots(base, [
      item('impex_supervisor', 'u1', 'Juan'),
      item('customs_declarant', 'u2', 'Maria'),
    ]);
    expect(filled[0].user_id).toBe('u1');
    expect(filled[0].user_name).toBe('Juan');
    expect(filled[2].user_id).toBe('u2');
    expect(filled[2].user_name).toBe('Maria');
  });

  it('leaves unmatched slots null', () => {
    const filled = applyItemsToSlots(base, [item('impex_supervisor', 'u1', 'Juan')]);
    // team_leader and customs_declarant should stay null
    expect(filled[1].user_id).toBeNull();
    expect(filled[2].user_id).toBeNull();
  });

  it('ignores items with role_keys not in the catalog', () => {
    const filled = applyItemsToSlots(base, [item('unknown_role', 'u9', 'Ghost')]);
    expect(filled.every((s) => s.user_id === null)).toBe(true);
  });

  it('returns base slots unchanged when items array is empty', () => {
    const filled = applyItemsToSlots(base, []);
    expect(filled.every((s) => s.user_id === null)).toBe(true);
    expect(filled).toHaveLength(3);
  });

  it('first matching item wins when duplicates exist', () => {
    const filled = applyItemsToSlots(base, [
      item('team_leader', 'u1', 'First'),
      item('team_leader', 'u2', 'Second'),
    ]);
    expect(filled[1].user_id).toBe('u1');
  });
});

// ─── buildFreeformSlots ───────────────────────────────────────────────────────

describe('buildFreeformSlots', () => {
  it('converts profile items into assignment slots with all fields populated', () => {
    const items = [
      item('pricing_analyst', 'u1', 'Ana', 0),
      item('account_rep',     'u2', 'Ben', 1),
    ];
    const slots = buildFreeformSlots(items);
    expect(slots).toHaveLength(2);
    expect(slots[0].role_key).toBe('pricing_analyst');
    expect(slots[0].user_id).toBe('u1');
    expect(slots[0].required).toBe(false);
    expect(slots[0].allow_multiple).toBe(false);
    expect(slots[1].sort_order).toBe(1);
  });

  it('returns empty array when items is empty', () => {
    expect(buildFreeformSlots([])).toEqual([]);
  });
});

// ─── serviceProjection ────────────────────────────────────────────────────────

describe('serviceProjection', () => {
  it('returns service fields when service exists', () => {
    const proj = serviceProjection(service, 'Forwarding');
    expect(proj?.service_type).toBe('Forwarding');
    expect(proj?.default_manager_id).toBe('mgr_1');
    expect(proj?.default_manager_name).toBe('Alice Mgr');
  });

  it('falls back to fallbackServiceType when service is null', () => {
    const proj = serviceProjection(null, 'Brokerage');
    expect(proj?.service_type).toBe('Brokerage');
    expect(proj?.label).toBe('Brokerage');
    expect(proj?.default_manager_id).toBeNull();
    expect(proj?.default_manager_name).toBeNull();
  });
});

// ─── applyAssignmentPrecedence ────────────────────────────────────────────────

describe('applyAssignmentPrecedence — precedence ladder', () => {
  const base = {
    service,
    opsRoles,
    department: 'Operations',
    serviceType: 'Forwarding',
  };

  const customerProfile = profile('cust_1', 'customer', 'default', [
    item('impex_supervisor', 'u_cust', 'Cust Supervisor'),
  ], { id: 'team_a', name: 'Alpha Team' });

  const contactProfile = profile('cont_1', 'contact', 'override', [
    item('impex_supervisor', 'u_cont', 'Contact Supervisor'),
  ]);

  const tradePartyProfile = profile('tp_1', 'trade_party', 'default', [
    item('impex_supervisor', 'u_tp', 'TP Supervisor'),
  ]);

  const deptProfile = profile('dept_1', 'customer', 'default', [
    item('pricing_analyst', 'u_dept', 'Dept Person'),
  ]);

  it('contact override wins over everything', () => {
    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        contactProfile,
      tradePartyDefault:      tradePartyProfile,
      customerServiceDefault: customerProfile,
      customerDeptDefault:    deptProfile,
    });
    expect(result.source).toBe('contact_override');
    expect(result.assignments.find((a) => a.role_key === 'impex_supervisor')?.user_id).toBe('u_cont');
    expect(result.scopeMeta.profileId).toBe('cont_1');
  });

  it('trade-party default wins when no contact override', () => {
    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        null,
      tradePartyDefault:      tradePartyProfile,
      customerServiceDefault: customerProfile,
      customerDeptDefault:    deptProfile,
    });
    expect(result.source).toBe('trade_party_default');
    expect(result.assignments.find((a) => a.role_key === 'impex_supervisor')?.user_id).toBe('u_tp');
  });

  it('customer service-scoped default wins over dept default', () => {
    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: customerProfile,
      customerDeptDefault:    deptProfile,
    });
    expect(result.source).toBe('customer_default');
    expect(result.assignments.find((a) => a.role_key === 'impex_supervisor')?.user_id).toBe('u_cust');
    expect(result.teamPool).toEqual({ id: 'team_a', name: 'Alpha Team' });
  });

  it('department default wins when no service-scoped match', () => {
    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: null,
      customerDeptDefault:    deptProfile,
    });
    expect(result.source).toBe('department_default');
  });

  it('falls back to service_default when all candidates are null but service exists', () => {
    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: null,
      customerDeptDefault:    null,
    });
    expect(result.source).toBe('service_default');
    expect(result.assignments.every((a) => a.user_id === null)).toBe(true);
    expect(result.service?.default_manager_id).toBe('mgr_1');
    expect(result.scopeMeta.profileId).toBeNull();
  });

  it("returns 'none' when no service and no candidates", () => {
    const result = applyAssignmentPrecedence({
      ...base,
      service:                null,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: null,
      customerDeptDefault:    null,
    });
    expect(result.source).toBe('none');
  });

  it('non-Ops department uses freeform slots, no service returned', () => {
    const bdProfile = profile('bd_1', 'customer', 'default', [
      item('account_rep', 'u_bd', 'BD Rep', 0),
    ]);
    const result = applyAssignmentPrecedence({
      service:                null,
      opsRoles:               [],
      department:             'Business Development',
      serviceType:            null,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: bdProfile,
      customerDeptDefault:    null,
    });
    expect(result.source).toBe('customer_default');
    expect(result.service).toBeNull();
    expect(result.assignments[0].role_key).toBe('account_rep');
    expect(result.assignments[0].user_id).toBe('u_bd');
  });

  it('scopeMeta reflects the winning profile', () => {
    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: customerProfile,
      customerDeptDefault:    null,
    });
    expect(result.scopeMeta).toEqual({
      profileId:   'cust_1',
      subjectType: 'customer',
      scopeKind:   'default',
    });
  });

  it('teamPool propagates from the winning profile', () => {
    const withTeam = profile('cust_2', 'customer', 'default', [
      item('impex_supervisor', 'u1', 'User'),
    ], { id: 'team_x', name: 'X Team' });

    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: withTeam,
      customerDeptDefault:    null,
    });
    expect(result.teamPool).toEqual({ id: 'team_x', name: 'X Team' });
  });

  it('empty items in winning profile leaves all slots null (Ops)', () => {
    // A profile with no items should return null slots, not crash
    const emptyProfile = profile('cust_3', 'customer', 'default', []);
    const result = applyAssignmentPrecedence({
      ...base,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: emptyProfile,
      customerDeptDefault:    null,
    });
    // empty profile — customer_default source but all slots unfilled
    expect(result.source).toBe('customer_default');
    expect(result.assignments.every((a) => a.user_id === null)).toBe(true);
  });
});

// ─── Ops roles array correctness ─────────────────────────────────────────────

describe('applyAssignmentPrecedence — Ops roles shape', () => {
  it('roles array mirrors the opsRoles catalog when Ops', () => {
    const result = applyAssignmentPrecedence({
      service,
      opsRoles,
      department: 'Operations',
      serviceType: 'Forwarding',
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: null,
      customerDeptDefault:    null,
    });
    expect(result.roles).toHaveLength(opsRoles.length);
    expect(result.roles.map((r) => r.role_key)).toEqual(
      opsRoles.map((r) => r.role_key),
    );
  });

  it('roles array mirrors freeform items when non-Ops', () => {
    const bdProfile = profile('bd_2', 'customer', 'default', [
      item('account_rep', 'u1', 'A', 0),
      item('pricing_analyst', 'u2', 'B', 1),
    ]);
    const result = applyAssignmentPrecedence({
      service:                null,
      opsRoles:               [],
      department:             'Pricing',
      serviceType:            null,
      contactOverride:        null,
      tradePartyDefault:      null,
      customerServiceDefault: bdProfile,
      customerDeptDefault:    null,
    });
    expect(result.roles.map((r) => r.role_key)).toEqual(['account_rep', 'pricing_analyst']);
  });
});
