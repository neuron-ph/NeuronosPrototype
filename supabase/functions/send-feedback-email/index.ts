import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/** N3: `title` and `description` were interpolated raw into the HTML below, so an
 *  anonymous caller could send DKIM-signed mail FROM the company domain TO the
 *  company inbox with markup of their choosing — a phishing primitive aimed at
 *  Marcus's own mailbox. Escaped at the boundary rather than trusted. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  feedback: "Feedback",
  feature: "Feature Request",
};

serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // N3 — THIS FUNCTION HAD NO AUTH GUARD AT ALL. Not an evaporating check like
    // H2; the Authorization header was simply never read. It runs with
    // verify_jwt:false, so anyone on the internet holding the publishable key
    // that ships in the bundle could send mail from noreply@neuron.com.ph to the
    // hardcoded company inbox, with attacker-chosen HTML, and burn the Resend
    // quota doing it.
    //
    // Feedback comes from signed-in beta users. Ask who they are, the same way
    // create-user and admin-user-actions already do.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authUserError || !authUserData?.user) {
      return new Response(JSON.stringify({ error: "Invalid authorization token" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { type, title, description, user_name, user_email } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const typeLabel = esc(TYPE_LABELS[type] ?? type);
    const subject = `[Neuron Beta] ${typeLabel}: ${String(title ?? "").slice(0, 200)}`;
    const fromName = esc(user_name ?? "A beta user");
    const fromEmail = user_email ? ` (${esc(user_email)})` : "";

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:#0F2820;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:2px;">Neuron OS</p>
              <h1 style="margin:0;font-size:22px;font-weight:600;color:#FFFFFF;">New ${typeLabel}</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#FFFFFF;border:1px solid #E5E9F0;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
                <tr>
                  <td style="padding:10px 14px;background:#F9FAFB;border:1px solid #E5E9F0;font-size:11px;color:#667085;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:90px;">Type</td>
                  <td style="padding:10px 14px;border:1px solid #E5E9F0;border-left:none;font-size:13px;color:#12332B;">${typeLabel}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#F9FAFB;border:1px solid #E5E9F0;border-top:none;font-size:11px;color:#667085;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">From</td>
                  <td style="padding:10px 14px;border:1px solid #E5E9F0;border-top:none;border-left:none;font-size:13px;color:#12332B;">${fromName}${fromEmail}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#F9FAFB;border:1px solid #E5E9F0;border-top:none;font-size:11px;color:#667085;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Title</td>
                  <td style="padding:10px 14px;border:1px solid #E5E9F0;border-top:none;border-left:none;font-size:13px;color:#12332B;font-weight:500;">${esc(title)}</td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:11px;color:#667085;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Description</p>
              <div style="background:#F9FAFB;border:1px solid #E5E9F0;border-radius:8px;padding:16px;font-size:13px;color:#12332B;line-height:1.6;white-space:pre-wrap;">${esc(description)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#667085;">Neuron OS Beta — hq@neuron.com.ph</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Neuron OS <noreply@neuron.com.ph>",
        to: ["hq@neuron.com.ph"],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend error: ${errText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
