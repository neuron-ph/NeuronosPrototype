import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

// Use a no-op lock to prevent the Web Locks API from deadlocking after
// page reloads. Supabase v2 acquires an exclusive navigator lock for token
// refresh coordination; if a previous session's lock is never released
// (e.g. after an expired-token reload), all subsequent queries queue forever.
// A no-op lock is safe for single-tab apps where cross-tab coordination isn't needed.
export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    lock: (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
  },
});
