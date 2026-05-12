import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { hasAdminUsersGrant } from "./adminUsersPermissions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[\w-]+\.vercel\.app)$/;
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
      .select("id, department, role")
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

    const callerModuleGrants = (callerOverride?.module_grants ?? {}) as Record<string, boolean>;
    const canCreateUsers = hasAdminUsersGrant(callerModuleGrants, "create", "users");

    if (!canCreateUsers) {
      return new Response(
        JSON.stringify({ success: false, error: "You do not have permission to create users" }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const {
      name, email, password, department, role, team_id,
      position, service_type, team_role, status, is_active,
      access_profile_id,
    } = await req.json();

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

    // Update the trigger-created users row with all fields atomically
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
        module_grants: {},
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
