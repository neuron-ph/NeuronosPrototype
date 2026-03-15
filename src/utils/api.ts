/**
 * apiFetch — Centralized JWT-forwarding fetch wrapper for the Edge Function API.
 *
 * Phase 3 of the User Roles Fix Blueprint.
 *
 * Replaces the old pattern of:
 *   fetch(`${API_URL}/path`, { headers: { Authorization: `Bearer ${publicAnonKey}` } })
 *
 * With:
 *   apiFetch('/path')
 *
 * Benefits:
 *   - Automatically attaches the user's JWT (from Supabase Auth session) as Bearer token
 *   - Falls back to the public anon key when no session exists (pre-login pages)
 *   - Sets Content-Type: application/json by default
 *   - Centralizes the base URL so it's defined in one place
 *   - When the server-side JWT middleware (Phase 3 server) is deployed,
 *     requests will be authenticated without any further frontend changes
 */
import { supabase } from './supabase/client';
import { projectId, publicAnonKey } from './supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-c142e950`;

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  // Get current session token — prefer JWT, fall back to anon key
  let token = publicAnonKey;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      token = session.access_token;
    }
  } catch {
    // If getSession fails, fall back to anon key
  }

  const { headers: customHeaders, ...rest } = options;

  // Don't set Content-Type for FormData — let the browser set the multipart boundary
  const isFormData = options.body instanceof FormData;

  return fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'Authorization': `Bearer ${token}`,
      ...(customHeaders instanceof Headers
        ? Object.fromEntries(customHeaders.entries())
        : customHeaders || {}),
    },
  });
}