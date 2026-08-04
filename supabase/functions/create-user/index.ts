import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { hasAdminUsersGrant } from "./adminUsersPermissions.ts";
import { refuseTargetReason, rankOf } from "./targetScope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[\w-]+\.vercel\.app|([\w-]+\.)*neuron\.com\.ph)$/;
function buildCors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGIN_RE.test(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

type AccessProfileRow = {
  id: string;
  name: string;
  module_grants: Record<string, boolean>;
  visibility_scope: string | null;
  visibility_departments: string[] | null;
};

function roleDefaultVisibilityScope(role: string): string {
  if (role === "executive") return "all";
  if (role === "manager") return "department";
  if (role === "team_leader" || role === "supervisor") return "team";
  return "own";
}

serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify JWT signature via admin client (does not rely on gateway verify_jwt setting).
    const jwt = authHeader.replace("Bearer ", "");
    const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(jwt);
    if (authUserError || !authUserData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authorization token" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
    const callerAuthId = authUserData.user.id;

    // Fetch caller identity (id needed for granted_by on profile application).
    const { data: callerProfile, error: profileError } = await adminClient
      .from("users")
      .select("id, department, role, access_profile_id")
      .eq("auth_id", callerAuthId)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not verify caller identity" }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const { data: callerOverride, error: callerOverrideError } = await adminClient
      .from("permission_overrides")
      .select("module_grants")
      .eq("user_id", callerProfile.id)
      .maybeSingle();

    if (callerOverrideError) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not verify caller permissions" }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Caller effective grants = assigned profile (base) overlaid with per-user override,
    // mirroring the strict resolver. Reading the override alone would wrongly deny a
    // caller whose create-users grant lives in their shared profile (post NEU-012).
    let callerProfileGrants: Record<string, boolean> = {};
    const callerProfileId = (callerProfile as { access_profile_id?: string | null }).access_profile_id;
    if (callerProfileId) {
      const { data: callerAp } = await adminClient
        .from("access_profiles")
        .select("module_grants, is_active")
        .eq("id", callerProfileId)
        .maybeSingle();
      if (callerAp?.is_active) {
        callerProfileGrants = (callerAp.module_grants ?? {}) as Record<string, boolean>;
      }
    }
    const callerModuleGrants = {
      ...callerProfileGrants,
      ...((callerOverride?.module_grants ?? {}) as Record<string, boolean>),
    };
    const canCreateUsers = hasAdminUsersGrant(callerModuleGrants, "create", "users");

    // Parsed here rather than further down: the authority questions below have
    // to be answered before anything else looks at this payload.
    const {
      name, email, password, department, role, team_id,
      position, service_type, team_role, status, is_active,
      access_profile_id,
    } = await req.json();

    if (!canCreateUsers) {
      return new Response(
        JSON.stringify({ success: false, error: "You do not have permission to create users" }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // N1 — THE CEILING. Holding exec_users:create used to mean "create anyone",
    // and `role` and `department` arrive in the request body. A Business
    // Development manager called this with role="executive" and minted an
    // account carrying 1,611 grants at visibility_scope 'all', with a password
    // he chose, then signed into it. He did not escalate his own account; he
    // built one above himself.
    //
    // Nobody may create an account more senior than their own, and nobody
    // outside Executive may create outside their own department.
    const ceilingRefusal = refuseTargetReason(
      { role: callerProfile.role, department: callerProfile.department },
      { role, department },
    );
    if (ceilingRefusal) {
      return new Response(
        JSON.stringify({ success: false, error: ceilingRefusal }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (!name || !email || !password || !department || !role) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: name, email, password, department, role" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const validDepartments = ["Business Development", "Pricing", "Operations", "Accounting", "HR", "Executive"];
    const validRoles = ["staff", "team_leader", "supervisor", "manager", "executive"];
    const validStatuses = ["active", "inactive", "suspended"];

    if (!validDepartments.includes(department) || !validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid department or role value" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (status && !validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid status value" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Validate access profile if provided
    let profileData: AccessProfileRow | null = null;
    // The ceiling again, by the other door: the grant matrix is seeded from an
    // access profile, so handing over a profile that TARGETS a more senior role
    // is the same escalation wearing a different hat.
    if (access_profile_id) {
      const { data: requestedProfile } = await adminClient
        .from("access_profiles")
        .select("target_role, target_department")
        .eq("id", access_profile_id)
        .maybeSingle();
      if (requestedProfile) {
        const callerRank = rankOf(callerProfile.role, callerProfile.department);
        const profileRank = rankOf(requestedProfile.target_role, requestedProfile.target_department);
        if (profileRank > callerRank) {
          return new Response(
            JSON.stringify({ success: false, error: "You cannot assign an access profile more senior than your own" }),
            { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (access_profile_id) {
      const { data: profile, error: pfErr } = await adminClient
        .from("access_profiles")
        .select("id, name, module_grants, visibility_scope, visibility_departments, is_active")
        .eq("id", access_profile_id)
        .maybeSingle();

      if (pfErr || !profile) {
        return new Response(
          JSON.stringify({ success: false, error: "Access profile not found" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
      if (!profile.is_active) {
        return new Response(
          JSON.stringify({ success: false, error: "Access profile is not active" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
      profileData = profile;
    } else {
      const { data: fallbackProfile } = await adminClient
        .from("access_profiles")
        .select("id, name, module_grants, visibility_scope, visibility_departments")
        .eq("is_active", true)
        .eq("target_role", role)
        .or(`target_department.eq.${department},target_department.is.null`)
        .order("target_department", { ascending: false })
        .limit(1)
        .maybeSingle();
      profileData = (fallbackProfile as AccessProfileRow | null) ?? null;
    }

    // Create the Supabase Auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      const httpStatus = authError.message.toLowerCase().includes("already registered") ? 409 : 400;
      return new Response(
        JSON.stringify({ success: false, error: authError.message }),
        { status: httpStatus, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const newAuthUserId = authData.user.id;
    const isOps = department === "Operations";
    const resolvedStatus = status || "active";

    // Update the trigger-created users row with all fields atomically.
    // Matrix is king (migrations 220/221): users.access_profile_id is just a LABEL of
    // which template was applied; enforcement reads the user's own
    // permission_overrides.module_grants matrix, which we seed verbatim from the chosen
    // template below. A new user with an empty matrix would have zero access.
    const updatePayload = {
      name,
      department,
      role,
      team_id: isOps ? (team_id || null) : null,
      position: position || null,
      service_type: isOps ? (service_type || null) : null,
      team_role: isOps ? (team_role || null) : null,
      status: resolvedStatus,
      is_active: is_active !== false && resolvedStatus === "active",
      access_profile_id: profileData?.id ?? null,
    };

    let updateResult = await adminClient
      .from("users")
      .update(updatePayload)
      .eq("auth_id", newAuthUserId)
      .select("id, name, email, department, role, status, is_active")
      .maybeSingle();

    // Retry once if trigger hasn't fired yet
    if (!updateResult.data) {
      await new Promise((r) => setTimeout(r, 500));
      updateResult = await adminClient
        .from("users")
        .update(updatePayload)
        .eq("auth_id", newAuthUserId)
        .select("id, name, email, department, role, status, is_active")
        .maybeSingle();
    }

    if (updateResult.error || !updateResult.data) {
      return new Response(
        JSON.stringify({ success: false, error: updateResult.error?.message ?? "Failed to update user profile" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const newUserId = updateResult.data.id;

    const effectiveScope = profileData?.visibility_scope ?? roleDefaultVisibilityScope(role);
    const effectiveDepartments = effectiveScope === "selected_departments"
      ? (profileData?.visibility_departments ?? [])
      : null;
    const { error: overrideError } = await adminClient
      .from("permission_overrides")
      .upsert({
        user_id: newUserId,
        scope: effectiveScope,
        departments: effectiveDepartments,
        // Seed the matrix verbatim from the chosen template — the sole enforced truth.
        module_grants: (profileData?.module_grants ?? {}) as Record<string, boolean>,
        applied_profile_id: profileData?.id ?? null,
        granted_by: callerProfile.id,
        notes: profileData
          ? `Applied during user creation: ${profileData.name}`
          : `Default role visibility applied during user creation: ${effectiveScope}`,
      }, { onConflict: "user_id" });

    if (overrideError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `User created but access initialization failed: ${overrideError.message}`,
        }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: updateResult.data,
        applied_profile: profileData ? { id: profileData.id, name: profileData.name } : null,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
