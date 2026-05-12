import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasAdminUsersGrant, type AdminUsersAction } from "./adminUsersPermissions.ts";

const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[\w-]+\.vercel\.app)$/;
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
      .select("id, role")
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

    if (action === "resetPassword") {
      const { userId, newPassword } = params as { userId: string; newPassword: string };
      if (!userId || !newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return respond({ error: "userId and newPassword (min 8 chars) required" }, 400);
      }
      const authId = await getAuthId(userId);
      const { error } = await adminClient.auth.admin.updateUserById(authId, { password: newPassword });
      if (error) throw error;
      return respond({ success: true });
    }

    if (action === "deleteUser") {
      const { userId } = params as { userId: string };
      if (!userId) return respond({ error: "userId required" }, 400);
      if (userId === callerProfile.id) {
        return respond({ error: "Cannot delete your own account" }, 400);
      }
      const authId = await getAuthId(userId);
      await adminClient.from("users").delete().eq("id", userId);
      const { error: authError } = await adminClient.auth.admin.deleteUser(authId);
      if (authError) throw authError;
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
      const { error } = await adminClient
        .from("users")
        .update({ status, is_active: status === "active" })
        .eq("id", userId);
      if (error) throw error;
      return respond({ success: true });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respond({ error: message }, 400);
  }
});
