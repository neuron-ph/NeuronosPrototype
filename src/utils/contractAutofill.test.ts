import { describe, it, expect } from 'vitest';
import {
  autofillBrokerageFromContract,
  autofillForwardingFromContract,
  autofillTruckingFromContract,
  autofillOthersFromContract,
  autofillMarineInsuranceFromContract,
} from './contractAutofill';
import type { QuotationNew } from '../types/pricing';

type AnyResult = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helper: minimal contract fixture
// ---------------------------------------------------------------------------

function makeContract(overrides?: Partial<QuotationNew>): QuotationNew {
  return {
    id: 'c-1',
    quote_number: 'QUO-001',
    quotation_name: 'Test Contract',
    created_date: '2025-01-01',
    valid_until: '2025-12-31',
    customer_id: 'cust-1',
    customer_name: 'Falcon Logistics',
    contact_person_id: 'cp-1',
    contact_person_name: 'Juan Cruz',
    quotation_type: 'contract',
    services_metadata: [],
    ...overrides,
  } as any;
}

function withService(
  contract: QuotationNew,
  serviceType: string,
  details: Record<string, unknown>,
): QuotationNew {
  return {
    ...contract,
    services_metadata: [
      ...(contract.services_metadata ?? []),
      { service_type: serviceType as any, service_details: details as any },
    ],
  };
}

// ---------------------------------------------------------------------------
// Brokerage
// ---------------------------------------------------------------------------

describe('autofillBrokerageFromContract', () => {
  it('carries canonical brokerage fields', () => {
    const contract = withService(makeContract(), 'Brokerage', {
      brokerage_type: 'Standard',
      pod_aod: 'MICP',
      mode: 'FCL',
      cargo_type: 'Dry',
      commodity_description: 'Electronics',
      delivery_address: '123 Main St',
    });
    const result = autofillBrokerageFromContract(contract) as AnyResult;
    expect(result.brokerageType).toBe('Standard');
    expect(result.pod).toBe('MICP');
    expect(result.mode).toBe('FCL');
    expect(result.cargoType).toBe('Dry');
    expect(result.commodityDescription).toBe('Electronics');
    expect(result.deliveryAddress).toBe('123 Main St');
  });

  it('reads brokerageType from legacy "subtype" key', () => {
    const contract = withService(makeContract(), 'Brokerage', { subtype: 'All-Inclusive' });
    const result = autofillBrokerageFromContract(contract) as AnyResult;
    expect(result.brokerageType).toBe('All-Inclusive');
  });

  it('reads commodity from legacy "commodity" key', () => {
    const contract = withService(makeContract(), 'Brokerage', { commodity: 'Old Goods' });
    const result = autofillBrokerageFromContract(contract) as AnyResult;
    expect(result.commodityDescription).toBe('Old Goods');
  });

  it('returns empty strings when no service details', () => {
    const contract = makeContract(); // no services_metadata
    const result = autofillBrokerageFromContract(contract) as AnyResult;
    // With no service details, mapping returns '' for all fields
    expect(result.brokerageType).toBe('');
    expect(result.commodityDescription).toBe('');
    expect(result.contract_id).toBe('c-1'); // header fields always present
  });

  it('includes contract_id in result', () => {
    const result = autofillBrokerageFromContract(makeContract({ id: 'c-99' }));
    expect(result.contract_id).toBe('c-99');
  });
});

// ---------------------------------------------------------------------------
// Forwarding
// ---------------------------------------------------------------------------

describe('autofillForwardingFromContract', () => {
  it('carries all matrix carry-over fields via canonical keys', () => {
    const contract = withService(makeContract(), 'Forwarding', {
      incoterms: 'FOB',
      cargo_type: 'Reefer',
      cargo_nature: 'Perishables',
      commodity_description: 'Frozen Chicken',
      pol_aol: 'MNL',
      pod_aod: 'LAX',
      mode: 'LCL',
      collection_address: '',
      transit_time: '14 Days',
      carrier_airline: 'Evergreen',
      routing: 'MNL-HKG-LAX',
      stackable: true,
    });
    const result = autofillForwardingFromContract(contract) as AnyResult;
    expect(result.incoterms).toBe('FOB');
    expect(result.cargoType).toBe('Reefer');
    expect(result.cargoNature).toBe('Perishables');
    expect(result.commodityDescription).toBe('Frozen Chicken');
    expect(result.aolPol).toBe('MNL');
    expect(result.aodPod).toBe('LAX');
    expect(result.mode).toBe('LCL');
    expect(result.transitTime).toBe('14 Days');
    expect(result.carrier).toBe('Evergreen');
    expect(result.routing).toBe('MNL-HKG-LAX');
    expect(result.stackable).toBe(true);
  });

  it('reads from legacy aolPol key (old quotation saves)', () => {
    const contract = withService(makeContract(), 'Forwarding', { aolPol: 'NAIA' });
    const result = autofillForwardingFromContract(contract) as AnyResult;
    expect(result.aolPol).toBe('NAIA');
  });

  it('reads commodity from legacy "commodity" key', () => {
    const contract = withService(makeContract(), 'Forwarding', { commodity: 'Shoes' });
    const result = autofillForwardingFromContract(contract) as AnyResult;
    expect(result.commodityDescription).toBe('Shoes');
  });

  it('includes contract_id', () => {
    const result = autofillForwardingFromContract(makeContract({ id: 'c-fwd' }));
    expect(result.contract_id).toBe('c-fwd');
  });

  it('falls back to Brokerage for countryOfOrigin and preferentialTreatment when Forwarding lacks them', () => {
    const contract = withService(
      withService(makeContract(), 'Forwarding', {
        incoterms: 'FOB',
        cargo_type: 'Dry',
      }),
      'Brokerage',
      {
        country_of_origin: 'Japan',
        preferential_treatment: 'Form E',
      },
    );
    const result = autofillForwardingFromContract(contract) as AnyResult;
    expect(result.countryOfOrigin).toBe('Japan');
    expect(result.preferentialTreatment).toBe('Form E');
  });
});

// ---------------------------------------------------------------------------
// Trucking
// ---------------------------------------------------------------------------

describe('autofillTruckingFromContract', () => {
  it('carries trucking_line_items repeater', () => {
    const lineItems = [
      { destination: 'Pasay', truck_type: '10W', quantity: 2 },
    ];
    const contract = withService(makeContract(), 'Trucking', { trucking_line_items: lineItems });
    const result = autofillTruckingFromContract(contract) as AnyResult;
    expect(result.truckingLineItems).toEqual(lineItems);
  });

  it('reads pull_out_location from legacy pull_out key', () => {
    const contract = withService(makeContract(), 'Trucking', { pull_out: 'Port Area' });
    const result = autofillTruckingFromContract(contract) as AnyResult;
    expect(result.pullOutLocation).toBe('Port Area');
  });
});

// ---------------------------------------------------------------------------
// Marine Insurance
// ---------------------------------------------------------------------------

describe('autofillMarineInsuranceFromContract', () => {
  it('carries matrix fields', () => {
    const contract = withService(makeContract(), 'Marine Insurance', {
      commodity_description: 'Electronics',
      hs_codes: '8471.30',
      pol_aol: 'MICP',
      pod_aod: 'LAEM',
      invoice_value: 50000,
    });
    const result = autofillMarineInsuranceFromContract(contract) as AnyResult;
    expect(result.commodityDescription).toBe('Electronics');
    expect(result.hsCode).toBe('8471.30');
    expect(result.departurePort).toBe('MICP');
    expect(result.arrivalPort).toBe('LAEM');
    expect(result.invoiceValue).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// Others
// ---------------------------------------------------------------------------

describe('autofillOthersFromContract', () => {
  it('carries service_description', () => {
    const contract = withService(makeContract(), 'Others', { service_description: 'Customs consultation' });
    const result = autofillOthersFromContract(contract) as AnyResult;
    expect(result.serviceDescription).toBe('Customs consultation');
  });
});
