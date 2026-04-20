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

    if (action === "createUser") {
      const { email, password, name, department, role, position, service_type } = params as {
        email: string;
        password: string;
        name: string;
        department: string;
        role: string;
        position?: string;
        service_type?: string;
      };

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (error) throw error;
      if (!data.user) throw new Error("User creation returned no user");

      // Wait briefly for the trigger to create the profile row
      await new Promise((r) => setTimeout(r, 500));

      const { error: profileError } = await adminClient
        .from("users")
        .update({ name, department, role, position: position || null, service_type: service_type || null, is_active: true, status: "active" })
        .eq("auth_id", data.user.id);

      if (profileError) throw profileError;

      return respond({ success: true, userId: data.user.id });
    }

    if (action === "resetPassword") {
      const { userId, newPassword } = params as { userId: string; newPassword: string };
      const { data: profile, error: lookupError } = await adminClient
        .from("users").select("auth_id").eq("id", userId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!profile?.auth_id) throw new Error("User auth account not found");
      const { error } = await adminClient.auth.admin.updateUserById(profile.auth_id, { password: newPassword });
      if (error) throw error;
      return respond({ success: true });
    }

    if (action === "deleteUser") {
      const { userId } = params as { userId: string };
      // Look up auth_id — auth.admin.deleteUser needs the auth UUID, not the public users.id
      const { data: profile, error: lookupError } = await adminClient
        .from("users").select("auth_id").eq("id", userId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!profile?.auth_id) throw new Error("User auth account not found");
      const { error: authError } = await adminClient.auth.admin.deleteUser(profile.auth_id);
      if (authError) throw authError;
      // Delete the users row (may already be gone via trigger, ignore error)
      await adminClient.from("users").delete().eq("id", userId);
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
