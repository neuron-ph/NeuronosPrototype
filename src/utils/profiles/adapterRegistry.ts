import type { ProfileAdapter } from './profileAdapters';
import { customerAdapter } from './adapters/customerAdapter';
import { userAdapter } from './adapters/userAdapter';
import { serviceProviderAdapter } from './adapters/serviceProviderAdapter';
import { tradePartyAdapter } from './adapters/tradePartyAdapter';
import { locationAdapter } from './adapters/locationAdapter';
import { countryAdapter } from './adapters/countryAdapter';
import { dispatchPeopleAdapter } from './adapters/dispatchPeopleAdapter';
import { vehicleAdapter } from './adapters/vehicleAdapter';
import { profileRegistry } from '../../config/profiles/profileRegistry';

/**
 * Returns the ProfileAdapter for a given profileType, plus any providerTag
 * that should be forwarded to the adapter's search/fetchById calls.
 */
export function getAdapterForType(profileType: string): {
  adapter: ProfileAdapter;
  providerTag?: string;
} | null {
  const entry = profileRegistry[profileType];
  if (!entry) return null;

  switch (entry.source) {
    case 'customers':
      return { adapter: customerAdapter };
    case 'users':
      return { adapter: userAdapter };
    case 'service_providers':
      return { adapter: serviceProviderAdapter, providerTag: entry.providerTag ?? profileType };
    case 'trade_parties':
      return { adapter: tradePartyAdapter, providerTag: profileType };
    case 'profile_locations':
      return { adapter: locationAdapter, providerTag: profileType };
    case 'profile_countries':
      return { adapter: countryAdapter };
    case 'dispatch_people':
      return { adapter: dispatchPeopleAdapter, providerTag: profileType };
    case 'vehicles':
      return { adapter: vehicleAdapter };
    default:
      return null;
  }
}
