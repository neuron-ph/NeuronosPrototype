import { supabase } from "../supabase/client";

export type AttributeBag = Record<string, unknown>;

export type Authority = {
  department?: string | null;
  role?: string | null;
  scope?: string | null;
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
    const actual = norm(bag[key]);
    if (Array.isArray(expected)) {
      return expected.some((e) => norm(e) === actual);
    }
    return norm(expected) === actual;
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
