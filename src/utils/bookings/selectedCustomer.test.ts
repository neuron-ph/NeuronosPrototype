import { describe, expect, it } from 'vitest';
import { getSelectedCustomer } from './selectedCustomer';

describe('getSelectedCustomer', () => {
  it('reads id and label from a linked customer selection', () => {
    const result = getSelectedCustomer({
      customer_name: {
        id: 'cust-123',
        label: 'Batangas Steel Fabricators Inc.',
        profileType: 'customer',
        source: 'linked',
      },
    });

    expect(result).toEqual({
      customerId: 'cust-123',
      customerName: 'Batangas Steel Fabricators Inc.',
    });
  });

  it('falls back to top-level customer_id for legacy string values', () => {
    const result = getSelectedCustomer({
      customer_name: 'Legacy Customer',
      customer_id: 'cust-legacy',
    });

    expect(result).toEqual({
      customerId: 'cust-legacy',
      customerName: 'Legacy Customer',
    });
  });

  it('uses the fallback id when the selected object has no id', () => {
    const result = getSelectedCustomer(
      {
        customer_name: {
          id: null,
          label: 'Manual Customer',
          profileType: 'customer',
          source: 'manual',
        },
      },
      'cust-fallback',
    );

    expect(result).toEqual({
      customerId: 'cust-fallback',
      customerName: 'Manual Customer',
    });
  });

  it('returns an empty name for an unselected customer object', () => {
    const result = getSelectedCustomer({
      customer_name: {
        id: null,
        label: '',
        profileType: 'customer',
        source: 'manual',
      },
    });

    expect(result).toEqual({
      customerId: null,
      customerName: '',
    });
  });
});
