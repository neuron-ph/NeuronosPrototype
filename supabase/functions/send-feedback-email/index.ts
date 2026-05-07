import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  feedback: "Feedback",
  feature: "Feature Request",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, title, description, user_name, user_email } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const typeLabel = TYPE_LABELS[type] ?? type;
    const subject = `[Neuron Beta] ${typeLabel}: ${title}`;
    const fromName = user_name ?? "A beta user";
    const fromEmail = user_email ? ` (${user_email})` : "";

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
                  <td style="padding:10px 14px;border:1px solid #E5E9F0;border-top:none;border-left:none;font-size:13px;color:#12332B;font-weight:500;">${title}</td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:11px;color:#667085;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Description</p>
              <div style="background:#F9FAFB;border:1px solid #E5E9F0;border-radius:8px;padding:16px;font-size:13px;color:#12332B;line-height:1.6;white-space:pre-wrap;">${description}</div>
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
