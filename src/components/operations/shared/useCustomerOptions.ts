/**
 * useCustomerOptions
 *
 * Shared hook that fetches customer dropdown options for booking creation panels.
 * Previously duplicated across all 5 panels (~15 lines each).
 *
 * @see /docs/blueprints/BOOKING_PANEL_DRY_BLUEPRINT.md
 */

import { useState, useEffect } from "react";
import { apiFetch } from "../../../utils/api";

interface CustomerOption {
  value: string;
  label: string;
}

export function useCustomerOptions(isOpen: boolean): CustomerOption[] {
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await apiFetch(`/customers`);
        if (response.ok) {
          const result = await response.json();
          const customers = result.data || result || [];
          const options = customers.map((c: any) => ({
            value: c.company_name || c.name || c.id,
            label: c.company_name || c.name || c.id,
          }));
          setCustomerOptions(options);
        }
      } catch (err) {
        console.error("Failed to fetch customers for dropdown:", err);
      }
    };
    if (isOpen) fetchCustomers();
  }, [isOpen]);

  return customerOptions;
}
