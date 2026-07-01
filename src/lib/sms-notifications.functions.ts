import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Normalize a Kenyan phone to MSISDN integer (2547XXXXXXXX).
function toMsisdn(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "254" + d.slice(1);
  else if (d.startsWith("7") || d.startsWith("1")) d = "254" + d;
  const n = Number(d);
  return Number.isFinite(n) && d.length >= 11 ? n : null;
}

async function sendSms(recipients: number[], message: string, reference?: string) {
  const uniq = Array.from(new Set(recipients.filter((n) => n && Number.isFinite(n))));
  if (uniq.length === 0) return { skipped: true as const };
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GATEWAYAPI_API_KEY = process.env.GATEWAYAPI_API_KEY;
  if (!LOVABLE_API_KEY || !GATEWAYAPI_API_KEY) {
    console.error("[sms] missing API keys");
    return { skipped: true as const };
  }
  const path = uniq.length === 1 ? "/mobile/single" : "/mobile/multi";
  const body = uniq.length === 1
    ? { sender: "CDK", recipient: uniq[0], message, reference }
    : { sender: "CDK", messages: uniq.map((r) => ({ recipient: r, message, reference })) };
  const res = await fetch(`https://connector-gateway.lovable.dev/gatewayapi${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GATEWAYAPI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[sms] gateway failed", res.status, t);
    return { skipped: true as const, error: `${res.status}` };
  }
  return { ok: true as const };
}

function appUrl() {
  return process.env.APP_URL || "https://cdkworkplan.lovable.app";
}

export const notifyFinanceSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ requestId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r } = await supabase
      .from("finance_requests")
      .select("id, requester_name, department_name, selected_super_admin_id, vicar_super_admin_id, procurator_super_admin_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!r) return { ok: false };
    const ids = [r.selected_super_admin_id, r.vicar_super_admin_id, r.procurator_super_admin_id].filter(Boolean) as string[];
    if (ids.length === 0) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, phone").in("id", ids);
    const phones = (profs ?? []).map((p) => toMsisdn(p.phone)).filter((x): x is number => x !== null);
    const link = `${appUrl()}/finance-requests?id=${r.id}`;
    const msg = `You have a pending finance request to approve/authorize from ${r.requester_name} in the ${r.department_name ?? "department"} department. Click this link to review: ${link}`;
    await sendSms(phones, msg, `fr-sub-${r.id}`);
    return { ok: true };
  });

export const notifyFinanceApproved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ requestId: z.string().uuid(), approverName: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r } = await supabase
      .from("finance_requests")
      .select("id, finance_request_mpesa(phone)")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!r) return { ok: false };
    const m = (r as { finance_request_mpesa: { phone: string | null } | { phone: string | null }[] | null }).finance_request_mpesa;
    const phone = Array.isArray(m) ? m[0]?.phone : m?.phone;
    const msisdn = toMsisdn(phone ?? null);
    if (!msisdn) return { ok: false, reason: "no_phone" };
    const msg = `Your request has been approved by ${data.approverName}. Current status: Pending final authorization.`;
    await sendSms([msisdn], msg, `fr-app-${r.id}`);
    return { ok: true };
  });

export const notifyFinanceAuthorized = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ requestId: z.string().uuid(), authorizerName: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r } = await supabase
      .from("finance_requests")
      .select("id, finance_request_mpesa(phone)")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!r) return { ok: false };
    const m = (r as { finance_request_mpesa: { phone: string | null } | { phone: string | null }[] | null }).finance_request_mpesa;
    const phone = Array.isArray(m) ? m[0]?.phone : m?.phone;
    const msisdn = toMsisdn(phone ?? null);
    if (!msisdn) return { ok: false, reason: "no_phone" };
    const msg = `Your finance request has been successfully authorized by ${data.authorizerName}. The workflow is complete.`;
    await sendSms([msisdn], msg, `fr-auth-${r.id}`);
    return { ok: true };
  });
