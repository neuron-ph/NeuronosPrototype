import { ServiceCatalogAdminTab } from './ProfilingServicesTab';

export function ProfilingSubServicesTab({ initialQuery = '' }: { initialQuery?: string }) {
  return <ServiceCatalogAdminTab kind="subservices" initialQuery={initialQuery} />;
}
