import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action, ...params } = body;

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
      const authId = await getAuthId(userId);
      const { error } = await adminClient.auth.admin.updateUserById(authId, { password: newPassword });
      if (error) throw error;
      return respond({ success: true });
    }

    if (action === "deleteUser") {
      const { userId } = params as { userId: string };
      const authId = await getAuthId(userId);
      // Delete public row first, then auth account
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

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
