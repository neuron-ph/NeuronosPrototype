/**
 * Centralized React Query key factory.
 * Add namespaces here as new data domains are introduced.
 */

export const queryKeys = {
  profiles: {
    all: ['profiles'] as const,
    lookup: (profileType: string, query: string) =>
      ['profiles', 'lookup', profileType, query] as const,
    byId: (profileType: string, id: string) =>
      ['profiles', 'byId', profileType, id] as const,
    locations: (kind?: string) =>
      kind ? ['profiles', 'locations', kind] as const : ['profiles', 'locations'] as const,
    countries: () => ['profiles', 'countries'] as const,
    providers: (tag?: string) =>
      tag ? ['profiles', 'providers', tag] as const : ['profiles', 'providers'] as const,
    tradeParties: (roleScope?: string) =>
      roleScope ? ['profiles', 'tradeParties', roleScope] as const : ['profiles', 'tradeParties'] as const,
  },
};
