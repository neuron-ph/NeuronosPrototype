import { supabase } from '../supabase/client';
import { profileRegistry } from '../../config/profiles/profileRegistry';
import type { ProfileSelectionValue } from '../../types/profiles';

/**
 * Quick-create a new profile record inline from a booking form.
 * Inserts the minimal valid record into the correct table based on profileType,
 * returns a linked ProfileSelectionValue on success or null on failure.
 *
 * Only called for types where quickCreateAllowed = true in the registry.
 * Never enables quick-create for customer, user, or country.
 */
export async function quickCreateProfileRecord(
  name: string,
  profileType: string,
  userId: string | null,
  context: { serviceType?: string } = {},
): Promise<ProfileSelectionValue | null> {
  const entry = profileRegistry[profileType];
  if (!entry || !entry.quickCreateAllowed) return null;

  const trimmed = name.trim();
  if (!trimmed) return null;

  try {
    switch (entry.source) {
      case 'trade_parties': {
        const roleScope =
          profileType === 'shipper' ? 'shipper'
          : profileType === 'consignee' ? 'consignee'
          : 'both'; // consignee_or_shipper
        const { data, error } = await supabase
          .from('trade_parties')
          .insert({ name: trimmed, role_scope: roleScope, created_by: userId, updated_by: userId })
          .select('id, name')
          .single();
        if (error || !data) return null;
        return { id: data.id, label: data.name, profileType, source: 'linked' };
      }

      case 'profile_locations': {
        const kind = profileType === 'warehouse' ? 'warehouse' : 'port';
        const { data, error } = await supabase
          .from('profile_locations')
          .insert({ kind, name: trimmed, code: null, transport_modes: [], created_by: userId, updated_by: userId })
          .select('id, name')
          .single();
        if (error || !data) return null;
        return { id: data.id, label: data.name, profileType, source: 'linked' };
      }

      case 'dispatch_people': {
        const type = profileType === 'helper' ? 'helper' : 'driver';
        const { data, error } = await supabase
          .from('dispatch_people')
          .insert({ name: trimmed, type, phone: null, license_number: null, created_by: userId, updated_by: userId })
          .select('id, name')
          .single();
        if (error || !data) return null;
        return { id: data.id, label: data.name, profileType, source: 'linked' };
      }

      case 'vehicles': {
        const plateNumber = trimmed.toUpperCase();
        const { data, error } = await supabase
          .from('vehicles')
          .insert({ plate_number: plateNumber, vehicle_type: null, capacity: null, created_by: userId, updated_by: userId })
          .select('id, plate_number')
          .single();
        if (error || !data) return null;
        return { id: data.id, label: data.plate_number, profileType, source: 'linked' };
      }

      case 'service_providers': {
        const providerTag = entry.providerTag ?? profileType;
        const { data, error } = await supabase
          .from('service_providers')
          .insert({
            company_name: trimmed,
            provider_type: 'international',
            booking_profile_tags: [providerTag],
          })
          .select('id, company_name')
          .single();
        if (error || !data) return null;
        return { id: data.id, label: data.company_name, profileType, source: 'linked' };
      }

      case 'profile_carriers':
      case 'profile_forwarders': {
        const { data, error } = await supabase
          .from(entry.source)
          .insert({ name: trimmed })
          .select('id, name')
          .single();
        if (error || !data) return null;
        return { id: data.id, label: data.name, profileType, source: 'linked' };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
