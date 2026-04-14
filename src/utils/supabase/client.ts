import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const PROD_SUPABASE_URL = `https://${projectId}.supabase.co`;

// In production builds (any Vercel deployment), missing env vars must be fatal —
// the fallback silently connects to PROD, causing FK violations when data only
// exists on the dev database.
if (import.meta.env.PROD) {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error(
      '[Neuron] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set on all deployed ' +
      'environments. Set them in the Vercel dashboard (separately for Preview and Production).'
    );
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? PROD_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? publicAnonKey;

// Warn in dev console if a non-production URL is running against the prod database.
// This catches the "Preview env pointing at prod" misconfiguration.
if (import.meta.env.DEV || (import.meta.env.PROD && supabaseUrl !== PROD_SUPABASE_URL)) {
  // Always log so the developer can verify which DB the app is hitting.
  console.info(`[Neuron] Supabase: ${supabaseUrl}`);
}
if (import.meta.env.PROD && supabaseUrl === PROD_SUPABASE_URL) {
  console.warn(
    '[Neuron] ⚠ This deployment is connected to the PRODUCTION Supabase database. ' +
    'If this is a preview/staging build, update VITE_SUPABASE_URL in the Vercel dashboard ' +
    '(Preview environment) to point to the dev project (oqermaidggvanahumjmj).'
  );
}

// Use a no-op lock to prevent the Web Locks API from deadlocking after
// page reloads. Supabase v2 acquires an exclusive navigator lock for token
// refresh coordination; if a previous session's lock is never released
// (e.g. after an expired-token reload), all subsequent queries queue forever.
// A no-op lock is safe for single-tab apps where cross-tab coordination isn't needed.

// In dev/preview: give each tab its own auth slot using window.name as a stable
// tab ID (persists across refreshes within the same tab, empty for new tabs).
// This keeps both persisted auth storage and BroadcastChannel isolation per tab.
function getStorageKey(): string {
  if (typeof window === 'undefined') return 'sb-auth';
  if (import.meta.env.VITE_SESSION_STORAGE_AUTH !== 'true') return 'sb-auth';
  if (!window.name) window.name = crypto.randomUUID();
  return `sb-auth-${window.name}`;
}

function getAuthStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    return import.meta.env.VITE_SESSION_STORAGE_AUTH === 'true'
      ? window.sessionStorage
      : window.localStorage;
  } catch {
    return undefined;
  }
}

// Wrap fetch with a 20-second timeout so a hung auth token-refresh never
// blocks the Supabase client's internal refreshingDeferred indefinitely.
// Without this, one stalled /auth/v1/token request causes every subsequent
// supabase.from() call to queue behind it and appear to hang forever.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  // Respect any AbortSignal the caller already passed in
  const callerSignal = (init as RequestInit | undefined)?.signal;
  if (callerSignal) {
    if ((callerSignal as AbortSignal).aborted) {
      controller.abort();
    } else {
      (callerSignal as AbortSignal).addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const tid = setTimeout(() => controller.abort(), 20_000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(tid));
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getAuthStorage(),
    storageKey: getStorageKey(),
    persistSession: true,
    autoRefreshToken: true,
    // This app uses password auth, not OAuth callback URLs.
    detectSessionInUrl: false,
    lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
  },
  global: { fetch: fetchWithTimeout },
});
