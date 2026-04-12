import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? `https://${projectId}.supabase.co`;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? publicAnonKey;

// Use a no-op lock to prevent the Web Locks API from deadlocking after
// page reloads. Supabase v2 acquires an exclusive navigator lock for token
// refresh coordination; if a previous session's lock is never released
// (e.g. after an expired-token reload), all subsequent queries queue forever.
// A no-op lock is safe for single-tab apps where cross-tab coordination isn't needed.

// In dev/preview: give each tab its own auth slot using window.name as a stable
// tab ID (persists across refreshes within the same tab, empty for new tabs).
// This prevents session bleed-through when opening a new tab from an existing one.
function getStorageKey(): string {
  if (import.meta.env.VITE_SESSION_STORAGE_AUTH !== 'true') return 'sb-auth';
  if (!window.name) window.name = crypto.randomUUID();
  return `sb-auth-${window.name}`;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: getStorageKey(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
  },
});
