import { supabase } from "../supabase/client";

export type AttributeBag = Record<string, unknown>;

export type Authority = {
  department?: string | null;
  role?: string | null;
  scope?: string | null;
  user_id?: string | null; // NEU-095/103: route to a SPECIFIC user (overrides dept/role)
};

export type RoutingRule = {
  id: string;
  domain: string;
  label: string;
  trigger: Record<string, unknown>;
  authority: Authority;
  priority: number;
  active: boolean;
};

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);

/**
 * A trigger matches a bag when EVERY key in the trigger matches the bag's value
 * for that key. A trigger value may be a single value (equality) or an array
 * (membership). String comparison is case-insensitive. An empty trigger ({})
 * matches everything — i.e. a catch-all rule.
 */
export function matchesTrigger(
  trigger: Record<string, unknown>,
  bag: AttributeBag,
): boolean {
  return Object.entries(trigger).every(([key, expected]) => {
    const raw = bag[key];
    const expectedArr = (Array.isArray(expected) ? expected : [expected]).map(norm);
    // NEU-107 / D2: a bag value may itself be a SET (e.g. the distinct service
    // types across a voucher's per-line bookings). The trigger then matches if
    // ANY expected value is present in that set. Scalar bag values behave as before.
    if (Array.isArray(raw)) {
      const actualArr = raw.map(norm);
      return expectedArr.some((e) => actualArr.includes(e));
    }
    return expectedArr.includes(norm(raw));
  });
}

/**
 * Resolve the approver/assignee authority for an item, using the configurable
 * routing rules for the given domain. Rules are evaluated by ascending priority;
 * the first whose trigger matches the attribute bag wins. Returns null when no
 * rule matches, so the caller falls back to its own default authority.
 */
export async function resolveRouting(
  domain: string,
  bag: AttributeBag,
): Promise<Authority | null> {
  const { data, error } = await supabase
    .from("routing_rules")
    .select("trigger, authority, priority")
    .eq("domain", domain)
    .eq("active", true)
    .order("priority", { ascending: true });

  if (error) {
    console.warn(`[routing] failed to load rules for "${domain}":`, error.message);
    return null;
  }

  const rule = (data || []).find((r: { trigger: Record<string, unknown> }) =>
    matchesTrigger(r.trigger || {}, bag),
  );
  return rule ? ((rule as { authority: Authority }).authority ?? null) : null;
}
