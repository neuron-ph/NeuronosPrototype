/// <reference types="vite/client" />
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import posthog from 'posthog-js';
import { supabase } from '../utils/supabase/client';
import { logActivity } from '../utils/activityLog';
import type { Session } from '@supabase/supabase-js';

export interface User {
  id: string;
  email: string;
  name: string;
  department: 'Business Development' | 'Pricing' | 'Operations' | 'Accounting' | 'Executive' | 'HR';
  role: 'staff' | 'team_leader' | 'manager';
  created_at: string;
  is_active: boolean;
  team_id?: string | null;
  avatar_url?: string | null;   // user's avatar image URL
  phone?: string | null;         // contact phone number
  // Operations-specific: controls which Ops module tabs are visible (separate from RBAC role)
  service_type?: 'Forwarding' | 'Brokerage' | 'Trucking' | 'Marine Insurance' | 'Others' | null;
}

interface SignupOptions {
  department: string;
  role: string;
  service_type?: string | null;
}

interface DevRoleOverride {
  department: string;
  role: string;
  enabled: boolean;
  timestamp: string;
}

interface UserContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name: string, options?: SignupOptions) => Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }>;
  logout: () => void;
  isLoading: boolean;
  effectiveDepartment: string;
  effectiveRole: string;
  devOverride: DevRoleOverride | null;
  setDevOverride: (override: DevRoleOverride | null) => void;
  setUser: (user: User | null) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * Fetch the user's profile from the users table via direct Supabase query.
 * Uses the authenticated session — RLS ensures the user can read the users table.
 */
async function fetchUserProfile(authUid: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authUid)
      .maybeSingle();

    if (error || !data) {
      console.warn('[Neuron Auth] fetchUserProfile: no profile found for auth_id', authUid, error);
      return null;
    }

    return {
      id: data.id,
      email: data.email || '',
      name: data.name || data.email || '',
      department: data.department || 'Executive',
      role: data.role || 'staff',
      created_at: data.created_at || new Date().toISOString(),
      is_active: data.is_active !== false,
      team_id: data.team_id || null,
      avatar_url: data.avatar_url || null,
      phone: data.phone || null,
      service_type: data.service_type || null,
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [devOverride, setDevOverrideState] = useState<DevRoleOverride | null>(null);

  // Load dev override from localStorage on mount — DEV only
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const storedOverride = localStorage.getItem('neuron_dev_role_override');
    if (storedOverride) {
      try {
        const parsed = JSON.parse(storedOverride);
        if (parsed.enabled) {
          setDevOverrideState(parsed);
        }
      } catch (error) {
        console.error('Error parsing dev override:', error);
        localStorage.removeItem('neuron_dev_role_override');
      }
    }
  }, []);

  // Wrapper to save override to localStorage — DEV only
  const setDevOverride = (override: DevRoleOverride | null) => {
    if (!import.meta.env.DEV) return;
    setDevOverrideState(override);
    if (override) {
      localStorage.setItem('neuron_dev_role_override', JSON.stringify(override));
    } else {
      localStorage.removeItem('neuron_dev_role_override');
    }
  };

  // Computed effective values — override only applies in DEV builds
  const effectiveDepartment = (import.meta.env.DEV && devOverride?.enabled && devOverride.department)
    ? devOverride.department
    : user?.department || 'Operations';

  const effectiveRole = (import.meta.env.DEV && devOverride?.enabled && devOverride.role)
    ? devOverride.role
    : user?.role || 'staff';

  // Initialize auth — listen for Supabase session changes
  useEffect(() => {
    let isMounted = true;

    // Get initial session (with 5s timeout in case token refresh hangs)
    const sessionTimeout = new Promise<{ data: { session: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), 5000)
    );
    Promise.race([supabase.auth.getSession(), sessionTimeout])
    .then(async ({ data: { session: initialSession } }) => {
      if (!isMounted) return;

      if (initialSession) {
        setSession(initialSession);

        // Try to load cached profile first for instant render
        const cached = localStorage.getItem('neuron_user');
        let hasCache = false;
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            // Validate it's not stale format
            if (parsed.department !== "BD" && parsed.department !== "PD") {
              setUser(parsed);
              hasCache = true;
            }
          } catch { /* ignore */ }
        }

        // If we have a cached user, unblock the UI immediately and fetch fresh in true background
        if (hasCache && isMounted) setIsLoading(false);

        // Fetch fresh profile (background if cache existed, blocking if not)
        const profile = await fetchUserProfile(initialSession.user.id);
        if (isMounted && profile) {
          setUser(profile);
          localStorage.setItem('neuron_user', JSON.stringify(profile));
          posthog.identify(profile.id, {
            email: profile.email,
            name: profile.name,
            department: profile.department,
            role: profile.role,
          });
        }
      } else {
        // No session — check for legacy localStorage user (pre-auth)
        const cached = localStorage.getItem('neuron_user');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.department !== "BD" && parsed.department !== "PD") {
              setUser(parsed);
            }
          } catch { /* ignore */ }
        }
      }

      // Mark loading done (no-op if already cleared above via cache path)
      if (isMounted) setIsLoading(false);
    }).catch(() => {
      if (isMounted) setIsLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) return;

        setSession(newSession);

        if (event === 'SIGNED_IN' && newSession) {
          const profile = await fetchUserProfile(newSession.user.id);
          if (isMounted && profile) {
            setUser(profile);
            localStorage.setItem('neuron_user', JSON.stringify(profile));
            posthog.identify(profile.id, {
              email: profile.email,
              name: profile.name,
              department: profile.department,
              role: profile.role,
            });
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem('neuron_user');
        }
      }
    );

    // Background seeding — disabled (Edge Function not available on this project)
    // Seeding should be done via SQL or Supabase dashboard instead.
    console.log('[Neuron] Background seeding skipped — use SQL migrations or dashboard.');
    sessionStorage.setItem('neuron_seeding_done', 'true');

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signup = async (email: string, password: string, name: string, options?: SignupOptions) => {
    try {
      console.log('[Neuron Auth] signUp attempt:', { email, name });
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      console.log('[Neuron Auth] signUp response:', {
        error: error ? { message: error.message, status: error.status } : null,
        hasUser: !!data?.user,
        userId: data?.user?.id,
        identities: data?.user?.identities?.length,
        hasSession: !!data?.session,
        confirmed: data?.user?.confirmed_at,
        emailConfirmed: data?.user?.email_confirmed_at,
      });

      if (error) {
        return { success: false, error: `Auth error: ${error.message} (status: ${error.status})` };
      }

      if (!data.user) {
        return { success: false, error: 'No user returned from signup. Check Supabase Auth config.' };
      }

      // Check if this is a duplicate signup (user already exists).
      if (data.user.identities?.length === 0) {
        return { success: false, error: 'An account with this email already exists. Please sign in instead.' };
      }

      let activeSession = data.session;

      // If no session returned, try signing in immediately.
      if (!activeSession) {
        console.log('[Neuron Auth] No session from signUp, attempting auto-signin...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        console.log('[Neuron Auth] Auto-signin result:', {
          error: signInError ? signInError.message : null,
          hasSession: !!signInData?.session,
        });

        if (signInError) {
          return { 
            success: false, 
            error: `Account created but auto-login failed: ${signInError.message}. Email confirmation may still be enabled in Supabase Dashboard → Authentication → Email Provider → "Confirm email".`,
          };
        }
        activeSession = signInData.session;
      }

      if (!activeSession) {
        return { 
          success: false, 
          error: 'Account created but no session obtained. Check Supabase Auth settings.',
        };
      }

      // Session exists — user is logged in
      setSession(activeSession);

      // The auto-profile trigger fires on auth.users INSERT,
      // but there's a small delay. Give it a moment then fetch.
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update the auto-created profile with department/role from signup form
      if (options?.department || options?.role) {
        const updatePayload: Record<string, any> = {};
        if (options.department) updatePayload.department = options.department;
        if (options.role) updatePayload.role = options.role;
        if (options.service_type) updatePayload.service_type = options.service_type;

        console.log('[Neuron Auth] Updating profile with role info:', updatePayload);
        const { error: updateError } = await supabase
          .from('users')
          .update(updatePayload)
          .eq('auth_id', activeSession.user.id);

        if (updateError) {
          console.warn('[Neuron Auth] Failed to update profile with role info:', updateError);
          // Non-fatal — profile was still created, just without role/dept
        }
      }

      const profile = await fetchUserProfile(activeSession.user.id);
      if (profile) {
        setUser(profile);
        localStorage.setItem('neuron_user', JSON.stringify(profile));
      } else {
        // Trigger may not have fired yet, create a temp profile from what we know
        const tempUser: User = {
          id: 'user-' + (data.user?.id?.substring(0, 8) || 'new'),
          email,
          name,
          department: (options?.department as User['department']) || 'Executive',
          role: (options?.role as User['role']) || 'staff',
          created_at: new Date().toISOString(),
          is_active: true,
          team_id: null,
          avatar_url: null,
          phone: null,
          service_type: (options?.service_type as User['service_type']) || null,
        };
        setUser(tempUser);
        localStorage.setItem('neuron_user', JSON.stringify(tempUser));
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Signup failed' };
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      setSession(data.session);

      const profile = await fetchUserProfile(data.session.user.id);
      if (profile) {
        setUser(profile);
        localStorage.setItem('neuron_user', JSON.stringify(profile));
      } else {
        // Fallback: build user from session
        const tempUser: User = {
          id: 'user-' + (data.user?.id?.substring(0, 8) || 'unknown'),
          email: data.user.email || email,
          name: data.user.user_metadata?.name || email,
          department: 'Executive',
          role: 'staff',
          created_at: new Date().toISOString(),
          is_active: true,
          team_id: null,
          avatar_url: null,
          phone: null,
        };
        setUser(tempUser);
        localStorage.setItem('neuron_user', JSON.stringify(tempUser));
      }

      logActivity("user", data.user.id, data.user.email ?? data.user.id, "login", {
        id: data.user.id,
        name: data.user.email ?? "",
        department: "",
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const logout = async () => {
    if (user) {
      logActivity("user", user.id, user.name ?? user.email ?? user.id, "logout", {
        id: user.id,
        name: user.name ?? "",
        department: user.department ?? "",
      });
    }
    posthog.reset();
    // Clear local state immediately so the UI redirects to login without waiting
    setUser(null);
    setSession(null);
    localStorage.removeItem('neuron_user');
    setDevOverride(null);
    // Fire-and-forget — invalidate the server session in the background
    supabase.auth.signOut().catch(() => {});
  };

  return (
    <UserContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!user && !!session,
        login,
        signup,
        logout,
        isLoading,
        effectiveDepartment,
        effectiveRole,
        devOverride,
        setDevOverride,
        setUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}