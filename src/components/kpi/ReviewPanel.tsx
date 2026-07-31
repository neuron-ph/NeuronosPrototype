import { useState } from "react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { UI, type ScorecardTheme } from "./scorecardTokens";

// Review — where an evaluator puts in the numbers no resolver can produce.
//
// Roughly 36% of company-wide weight is `logged` or `judgment`: penalties,
// cargo damage, PMS, trip docs, punctuality, behaviour, BDD calls and emails.
// The engine has always read those from kpi_scores; until now nothing wrote them,
// so they sat at "Awaiting evaluation" and excluded themselves.
//
// Two rules the server enforces and this UI simply reflects:
//   * an `auto` KPI's ACTUAL cannot be typed over — it is computed
//   * a rating that differs from the suggestion needs a reason
//
// The suggestion is always shown. An evaluator should have to notice they are
// disagreeing with the data, not stumble into it.

export interface ReviewKpi {
  definition_id: string;
  name: string;
  weight_pct: number;
  source: "auto" | "proposed" | "logged" | "judgment";
  target_text: string | null;
  target_unit?: string | null;
  /** get_kpi_scorecard emits this as `actual`. */
  actual: number | null;
  actual_display: string | null;
  suggested_rating: number | null;
  rating: number | null;
  override_reason: string | null;
  excluded: boolean;
}

const RATINGS = [5, 4, 3, 2, 1];

export function ReviewPanel({
  userId, periodId, kpis, t, onSaved,
}: {
  userId: string;
  periodId: string;
  kpis: ReviewKpi[];
  t: ScorecardTheme;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { actual?: string; rating?: number; reason?: string }>>({});

  const manual = kpis.filter((k) => k.source === "logged" || k.source === "judgment");
  if (!manual.length) return null;

  const set = (id: string, patch: Partial<{ actual: string; rating: number; reason: string }>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (k: ReviewKpi) => {
    const d = draft[k.definition_id] ?? {};
    const actualRaw = d.actual ?? (k.actual == null ? "" : String(k.actual));
    const actual = actualRaw.trim() === "" ? null : Number(actualRaw);
    if (actual != null && Number.isNaN(actual)) {
      toast.error("Enter a number, or leave it blank.");
      return;
    }
    const rating = d.rating ?? k.rating ?? undefined;

    setBusy(k.definition_id);
    const { error } = await supabase.rpc("save_kpi_manual_entry", {
      p_user_id: userId,
      p_period_id: periodId,
      p_definition_id: k.definition_id,
      p_actual_value: actual,
      p_actual_display: null,
      p_rating: rating ?? null,
      p_override_reason: d.reason ?? k.override_reason ?? null,
    });
    setBusy(null);

    if (error) { toast.error(error.message); return; }
    toast.success(`${k.name} saved`);
    setDraft((x) => { const n = { ...x }; delete n[k.definition_id]; return n; });
    onSaved();
  };

  const clear = async (k: ReviewKpi) => {
    setBusy(k.definition_id);
    const { error } = await supabase.rpc("clear_kpi_manual_entry", {
      p_user_id: userId, p_period_id: periodId, p_definition_id: k.definition_id,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${k.name} cleared`);
    onSaved();
  };

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
      <div className="px-6 py-3 border-b" style={{ backgroundColor: UI.page, borderColor: UI.divider }}>
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: UI.inkMuted }}>
          Review · what only a person can judge
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: UI.divider }}>
        {manual.map((k) => {
          const d = draft[k.definition_id] ?? {};
          const actualVal = d.actual ?? (k.actual == null ? "" : String(k.actual));
          const rating = d.rating ?? k.rating ?? undefined;
          const isJudgment = k.source === "judgment";
          // Recompute the suggestion locally so it tracks what is being typed,
          // rather than lagging behind the last saved value.
          const typed = actualVal.trim() === "" ? null : Number(actualVal);
          const suggested = isJudgment || typed == null || Number.isNaN(typed)
            ? k.suggested_rating
            : typed <= 0 ? 5 : typed < 2 ? 3 : typed < 3 ? 2 : 1;
          const diverges = rating != null && suggested != null && rating !== suggested;
          const dirty = Object.keys(d).length > 0;

          return (
            <div key={k.definition_id} className="px-6 py-4">
              <div className="flex items-baseline justify-between mb-2.5">
                <span className="text-[13px] font-medium" style={{ color: UI.ink }}>
                  {k.name} <span style={{ color: UI.inkMuted, fontWeight: 400 }}>{Number(k.weight_pct)}%</span>
                </span>
                <span className="text-[11px]" style={{ color: UI.inkMuted }}>{k.target_text}</span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {!isJudgment && (
                  <input
                    value={actualVal}
                    onChange={(e) => set(k.definition_id, { actual: e.target.value })}
                    placeholder={k.target_unit === "pct" ? "e.g. 92" : "count"}
                    inputMode="decimal"
                    className="px-3 py-1.5 rounded-lg text-[13px] focus:outline-none"
                    style={{ width: 110, background: UI.page, border: `1px solid ${UI.divider}`, color: UI.ink }}
                  />
                )}

                <div className="flex items-center gap-1">
                  {RATINGS.map((r) => {
                    const active = rating === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => set(k.definition_id, { rating: r })}
                        className="text-[12px] font-medium rounded"
                        style={{
                          width: 30, height: 28,
                          background: active ? (r >= 4 ? t.good : r === 3 ? t.warning : t.critical) : UI.page,
                          color: active ? "#fff" : UI.inkSecondary,
                          border: `1px solid ${active ? "transparent" : UI.divider}`,
                        }}
                        title={r === suggested ? "Suggested by the data" : undefined}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>

                {suggested != null && (
                  <span className="text-[11px]" style={{ color: diverges ? t.warning : UI.inkMuted }}>
                    {diverges ? `Data suggests ${suggested}` : `Suggested ${suggested}`}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {k.rating != null && (
                    <button type="button" onClick={() => clear(k)} disabled={busy === k.definition_id}
                            className="text-[12px]" style={{ color: UI.inkMuted }}>
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => save(k)}
                    disabled={busy === k.definition_id || (!dirty && k.rating != null)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                    style={{
                      background: dirty || k.rating == null ? UI.accent : UI.page,
                      color: dirty || k.rating == null ? "#fff" : UI.inkMuted,
                      opacity: busy === k.definition_id ? 0.6 : 1,
                    }}
                  >
                    {busy === k.definition_id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>

              {/* The server refuses a divergent rating without a reason. Surfacing
                  the field only when it diverges keeps the common path to one click. */}
              {diverges && (
                <input
                  value={d.reason ?? k.override_reason ?? ""}
                  onChange={(e) => set(k.definition_id, { reason: e.target.value })}
                  placeholder="Why does your rating differ from the data?"
                  className="mt-2.5 w-full px-3 py-1.5 rounded-lg text-[12px] focus:outline-none"
                  style={{ background: UI.page, border: `1px solid ${t.warning}`, color: UI.ink }}
                />
              )}

              {k.actual_display && !dirty && (
                <p className="text-[11px] mt-2" style={{ color: UI.inkMuted }}>
                  Recorded: {k.actual_display}
                  {k.override_reason ? ` · overridden: ${k.override_reason}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-6 py-3 border-t text-[11px]" style={{ borderColor: UI.divider, color: UI.inkMuted }}>
        Automatic KPIs are not listed here: their actuals come from the system and cannot be typed over. A
        rating that differs from the suggestion is allowed, but it has to carry a reason.
      </div>
    </div>
  );
}
