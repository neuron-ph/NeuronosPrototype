import { describe, expect, it } from 'vitest';
import { validateBookingForm } from './bookingFormValidation';

describe('validateBookingForm', () => {
  it('treats an empty profile-lookup object as missing', () => {
    const errors = validateBookingForm(
      {
        service_type: 'Brokerage',
        status: 'Draft',
        movement_type: 'Import',
        mode: 'FCL',
        incoterms: '',
        customer_name: {
          id: null,
          label: '',
          profileType: 'customer',
          source: 'manual',
        },
        booking_name: 'BR Test',
      },
      'Brokerage',
      {
        service_type: 'Brokerage',
        status: 'Draft',
        movement_type: 'Import',
        mode: 'FCL',
        incoterms: '',
      },
      { requiredFieldKeys: ['customer_name', 'booking_name'] },
    );

    expect(errors.customer_name).toBe('Customer Name is required');
  });

  it('accepts a linked profile-lookup object with a label', () => {
    const errors = validateBookingForm(
      {
        service_type: 'Brokerage',
        status: 'Draft',
        movement_type: 'Import',
        mode: 'FCL',
        incoterms: '',
        customer_name: {
          id: 'cust-1',
          label: 'Batangas Steel Fabricators Inc.',
          profileType: 'customer',
          source: 'linked',
        },
        booking_name: 'BR Test',
      },
      'Brokerage',
      {
        service_type: 'Brokerage',
        status: 'Draft',
        movement_type: 'Import',
        mode: 'FCL',
        incoterms: '',
      },
      { requiredFieldKeys: ['customer_name', 'booking_name'] },
    );

    expect(errors.customer_name).toBeUndefined();
  });
});
