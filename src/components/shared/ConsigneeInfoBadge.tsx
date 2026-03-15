/**
 * ConsigneeInfoBadge — Small enrichment badge shown below the Consignee
 * field in booking detail views when a `consignee_id` is linked.
 *
 * Shows the saved consignee's address and TIN from the entity store,
 * giving the user richer context than the plain-text name alone.
 * If no consignee_id is present (free-text only), renders nothing.
 *
 * @see /docs/blueprints/CONSIGNEE_FEATURE_BLUEPRINT.md — Phase 3
 */

import { useState, useEffect } from "react";
import { Building2 } from "lucide-react";
import type { Consignee } from "../../types/bd";
import { apiFetch } from "../../utils/api";

interface ConsigneeInfoBadgeProps {
  consigneeId?: string;
}

export function ConsigneeInfoBadge({ consigneeId }: ConsigneeInfoBadgeProps) {
  const [consignee, setConsignee] = useState<Consignee | null>(null);

  useEffect(() => {
    if (!consigneeId) {
      setConsignee(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/consignees/${consigneeId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setConsignee(data);
      } catch {
        // Silently fail — badge is informational only
      }
    })();

    return () => { cancelled = true; };
  }, [consigneeId]);

  if (!consigneeId || !consignee) return null;

  const details: string[] = [];
  if (consignee.tin) details.push(`TIN: ${consignee.tin}`);
  if (consignee.address) details.push(consignee.address);
  if (consignee.contact_person) details.push(consignee.contact_person);

  if (details.length === 0) return null;

  return (
    <div
      className="flex items-start gap-1.5 mt-1 px-2 py-1.5 rounded-md"
      style={{ backgroundColor: "#E8F5F3", border: "1px solid #D1FAE5" }}
    >
      <Building2 size={12} className="mt-0.5 shrink-0" style={{ color: "#0F766E" }} />
      <div className="text-[11px] leading-[16px]" style={{ color: "#12332B" }}>
        <span className="font-medium" style={{ color: "#0F766E" }}>Linked Consignee</span>
        <span className="mx-1" style={{ color: "#94A3B8" }}>&middot;</span>
        {details.join(" · ")}
      </div>
    </div>
  );
}