import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasAdminUsersGrant, type AdminUsersAction } from "./adminUsersPermissions.ts";
import { refuseTargetReason } from "./targetScope.ts";

const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[\w-]+\.vercel\.app|([\w-]+\.)*neuron\.com\.ph)$/;
function buildCors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGIN_RE.test(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// N2: `edit` is doing far too much work here. Resetting a password is account
// takeover, and an admin reading the RBAC matrix sees a checkbox that reads "can
// change a user's name and department". Splitting it needs a new grant key and a
// migration to seed it, so for now the coarse mapping stays and the DAMAGE is
// bounded by target scoping + an audit row below. The key is still worth adding.
const ACTION_TO_GRANT: Record<string, AdminUsersAction> = {
  resetPassword: "edit",
  updateStatus: "edit",
  deleteUser: "delete",
};

Deno.serve(async (req: Request) => {
  const cors = buildCors(req);
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing authorization" }, 401);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(jwt);
    if (authUserError || !authUserData?.user) {
      return respond({ error: "Invalid authorization token" }, 401);
    }
    const callerAuthId = authUserData.user.id;

    const { data: callerProfile, error: profileError } = await adminClient
      .from("users")
      .select("id, name, role, department")
      .eq("auth_id", callerAuthId)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return respond({ error: "Could not verify caller identity" }, 403);
    }

    const { data: callerOverride } = await adminClient
      .from("permission_overrides")
      .select("module_grants")
      .eq("user_id", callerProfile.id)
      .maybeSingle();

    const callerGrants = (callerOverride?.module_grants ?? {}) as Record<string, boolean>;

    const body = await req.json();
    const { action, ...params } = body;

    const requiredGrant = ACTION_TO_GRANT[action];
    if (!requiredGrant) return respond({ error: "Unknown action" }, 400);

    if (!hasAdminUsersGrant(callerGrants, requiredGrant, "users")) {
      return respond({ error: "You do not have permission to perform this action" }, 403);
    }

    // Helper: resolve auth_id from public users.id
    const getAuthId = async (userId: string): Promise<string> => {
      const { data, error } = await adminClient
        .from("users")
        .select("auth_id")
        .eq("id", userId)
        .single();
      if (error || !data?.auth_id) throw new Error("Could not resolve auth account for user");
      return data.auth_id;
    };

    // N2: the ONLY relationship check in this file used to be
    // `userId === callerProfile.id`, and it defended deleteUser alone.
    // resetPassword and updateStatus had no target check whatsoever — no
    // department, no seniority, no visibility dial. Every action now passes
    // through here first.
    const guardTarget = async (userId: string) => {
      const { data: target, error } = await adminClient
        .from("users")
        .select("id, name, role, department")
        .eq("id", userId)
        .maybeSingle();
      if (error || !target) return { error: respond({ error: "Target user not found" }, 404) };
      const reason = refuseTargetReason(callerProfile, target);
      if (reason) return { error: respond({ error: reason }, 403) };
      return { target };
    };

    // N2: nothing was written down. Zero activity_log rows named who reset a
    // password, before or after. An account takeover that leaves no trace is
    // worse than one that does.
    const audit = async (verb: string, target: { id: string; name?: string | null }, detail?: string) => {
      await adminClient.from("activity_log").insert({
        entity_type: "user",
        entity_id: target.id,
        entity_name: target.name ?? target.id,
        action: verb,
        user_id: callerProfile.id,
        user_name: callerProfile.name ?? callerProfile.id,
        description: detail ?? null,
        created_at: new Date().toISOString(),
      });
    };

    if (action === "resetPassword") {
      const { userId, newPassword } = params as { userId: string; newPassword: string };
      if (!userId || !newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return respond({ error: "userId and newPassword (min 8 chars) required" }, 400);
      }
      const guard = await guardTarget(userId);
      if (guard.error) return guard.error;
      const authId = await getAuthId(userId);
      const { error } = await adminClient.auth.admin.updateUserById(authId, { password: newPassword });
      if (error) throw error;
      await audit("password_reset", guard.target!, "Password reset by an administrator");
      return respond({ success: true });
    }

    if (action === "deleteUser") {
      const { userId } = params as { userId: string };
      if (!userId) return respond({ error: "userId required" }, 400);
      if (userId === callerProfile.id) {
        return respond({ error: "Cannot delete your own account" }, 400);
      }
      const guard = await guardTarget(userId);
      if (guard.error) return guard.error;
      const authId = await getAuthId(userId);
      // N4: this used to delete the profile first and IGNORE the result, then
      // delete the auth account — so a failure between the two stranded an auth
      // account with no profile that 409s forever on re-create. Auth goes first
      // now, and the profile delete is only reached if it succeeded.
      const { error: authError } = await adminClient.auth.admin.deleteUser(authId);
      if (authError) throw authError;
      const { error: profileDeleteError } = await adminClient.from("users").delete().eq("id", userId);
      if (profileDeleteError) throw profileDeleteError;
      await audit("deleted", guard.target!, "User account deleted by an administrator");
      return respond({ success: true });
    }

    if (action === "updateStatus") {
      const { userId, status } = params as {
        userId: string;
        status: "active" | "inactive" | "suspended";
      };
      if (!userId || !["active", "inactive", "suspended"].includes(status)) {
        return respond({ error: "userId and valid status required" }, 400);
      }
      const guard = await guardTarget(userId);
      if (guard.error) return guard.error;
      const { error } = await adminClient
        .from("users")
        .update({ status, is_active: status === "active" })
        .eq("id", userId);
      if (error) throw error;
      await audit("status_changed", guard.target!, `Status set to ${status} by an administrator`);
      return respond({ success: true });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respond({ error: message }, 400);
  }
});
