import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase/client';
import type { User } from './useUser';

/**
 * useUsers — reusable hook for fetching filtered user lists from Supabase.
 * Replaces all Edge Function `fetch(/users?...)` calls with direct Supabase queries.
 * 
 * Usage:
 *   const { users, isLoading, error } = useUsers({ department: 'Business Development' });
 *   const { users: managers } = useUsers({ department: 'Operations', operations_role: 'Manager', enabled: isOpen });
 */

export interface UseUsersOptions {
  department?: User['department'];
  role?: User['role'];
  service_type?: User['service_type'];
  operations_role?: User['operations_role'];
  enabled?: boolean;
}

export interface UseUsersResult {
  users: User[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUsers(options: UseUsersOptions = {}): UseUsersResult {
  const { department, role, service_type, operations_role, enabled = true } = options;
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = () => setRefetchKey((k) => k + 1);

  useEffect(() => {
    if (!enabled) {
      setUsers([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchUsers = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('users')
          .select('id, name, email, department, role, is_active, service_type, operations_role, created_at')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (department) {
          query = query.eq('department', department);
        }
        if (role) {
          query = query.eq('role', role);
        }
        if (service_type) {
          query = query.eq('service_type', service_type);
        }
        if (operations_role) {
          query = query.eq('operations_role', operations_role);
        }

        const { data, error: queryError } = await query;

        if (cancelled) return;

        if (queryError) {
          console.error('[useUsers] Query error:', queryError);
          setError(queryError.message);
          setUsers([]);
        } else {
          setUsers((data as User[]) || []);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch users';
        console.error('[useUsers] Error:', message);
        setError(message);
        setUsers([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [department, role, service_type, operations_role, enabled, refetchKey]);

  return { users, isLoading, error, refetch };
}
