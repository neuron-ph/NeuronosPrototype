import { useEffect } from 'react';
import { supabase } from '../../../utils/supabase/client';
import type { ProfileSelectionValue } from '../../../types/profiles';

type SetField = (key: string, value: unknown) => void;

function toOwnerSelection(id: string, name: string): ProfileSelectionValue {
  return {
    id,
    label: name,
    profileType: 'user',
    source: 'linked',
  };
}

/**
 * Keeps booking.account_owner aligned with the selected customer's BD owner.
 *
 * Source of truth:
 * - `customers.owner_id`
 * - resolved user row from `users`
 */
export function useCustomerAccountOwnerAutofill(
  customerId: string | null,
  setField: SetField,
) {
  useEffect(() => {
    let cancelled = false;

    if (!customerId) {
      setField('account_owner', '');
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .select('owner_id')
          .eq('id', customerId)
          .maybeSingle();

        if (cancelled) return;
        if (customerError || !customer?.owner_id) {
          setField('account_owner', '');
          return;
        }

        const { data: owner, error: ownerError } = await supabase
          .from('users')
          .select('id, name')
          .eq('id', customer.owner_id)
          .maybeSingle();

        if (cancelled) return;
        if (ownerError || !owner?.id || !owner?.name) {
          setField('account_owner', '');
          return;
        }

        setField('account_owner', toOwnerSelection(owner.id, owner.name));
      } catch (error) {
        if (!cancelled) {
          console.error('useCustomerAccountOwnerAutofill:', error);
          setField('account_owner', '');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId, setField]);
}
