import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { CustomDropdown } from "../bd/CustomDropdown";
import { NeuronKPICard } from "../ui/NeuronKPICard";
import { ChevronDown, ChevronRight, Info, Target, TrendingDown, Gauge, CheckCircle2 } from "lucide-react";
import {
  BandLadder, ContributionBar, ScoreTrend, useScorecardTheme, type TrendPoint,
} from "./ScorecardCharts";
import { UI, statusColor, type ScorecardTheme } from "./scorecardTokens";

// My Scorecard — one employee, one period. Per docs/KPI_SCORECARD_DESIGN_BRIEF.md.
//
// Layout follows the established module language (Customers / Contacts): 32px
// header, NeuronKPICard row, then the standard rounded table with an uppercase
// header strip and divided rows. Chrome uses the app's CSS variables so dark mode
// behaves like every other page.
//
// The question this surface answers is "where do I stand", against the Falcons
// bands and against my own past. Never against colleagues: peer comparison is the
// executive surface's job, and a median tick here would be a leaderboard.
//
// Self-scoping by construction: get_kpi_scorecard refuses any user_id but the
// caller's. Score arithmetic lives in the RPC; this file renders, never computes.

interface KpiRow {
  definition_id: string;
  name: string;
  weight_pct: number;
  source: "auto" | "proposed" | "logged" | "judgment";
  definition_text: string | null;
  target_text: string | null;
  measurement_text: string | null;
  actual_display: string | null;
  rating: number | null;
  is_override: boolean;
  override_reason: string | null;
  excluded: boolean;
  excluded_reason: string | null;
  weighted_score: number | null;
  evidence: Record<string, unknown>[];
}

interface Scorecard {
  user_name: string;
  position: string | null;
  has_scorecard: boolean;
  period: { id: string; label: string; status: string };
  score: number | null;
  band: string | null;
  scored_on_pct: number;
  excluded_count: number;
  kpis: KpiRow[];
}

interface Period { id: string; label: string; status: string }
interface HistoryPoint { period_id: string; label: string; score: number | null; scored_on_pct: number }

// Below this much measured weight the headline stops claiming a band. A score
// computed on a sliver of the card is arithmetically right and rhetorically
// wrong: "100 · Outstanding" on 15% coverage reads as an achievement, and the
// caveat underneath is the part nobody reads.
const PROVISIONAL_COVERAGE_PCT = 50;

const RATING_LABEL: Record<number, string> = {
  5: "Outstanding", 4: "Very Satisfactory", 3: "Satisfactory", 2: "Needs Improvement", 1: "Poor",
};

function RatingPill({ rating, t }: { rating: number | null; t: ScorecardTheme }) {
  if (rating == null) {
    return <span className="text-[11px]" style={{ color: UI.inkMuted }}>—</span>;
  }
  const bg = rating >= 4 ? t.good : rating === 3 ? t.warning : t.critical;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-white w-fit"
      style={{ backgroundColor: bg }}
      title={RATING_LABEL[rating]}
    >
      {rating}
    </span>
  );
}

function RuleTooltip({ kpi }: { kpi: KpiRow }) {
  const [open, setOpen] = useState(false);
  if (!kpi.definition_text) return null;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
        className="ml-1.5 inline-flex items-center"
        aria-label={`How ${kpi.name} is measured`}
      >
        <Info size={12} style={{ color: UI.inkMuted }} />
      </button>
      {open && (
        <span
          className="absolute left-5 top-0 z-50 w-[360px] rounded-lg p-3 shadow-lg text-[12px] leading-[18px]"
          style={{ background: UI.surface, border: `1px solid ${UI.border}`, color: UI.ink }}
        >
          <span className="block mb-2">{kpi.definition_text}</span>
          {kpi.target_text && <span className="block" style={{ color: UI.inkMuted }}>Target: {kpi.target_text}</span>}
          {kpi.measurement_text && (
            <span className="block" style={{ color: UI.inkMuted }}>Measured: {kpi.measurement_text}</span>
          )}
        </span>
      )}
    </span>
  );
}

// Evidence shapes differ per metric (quotations carry hours + threshold, billing
// carries delivery vs invoice dates), so render whatever the resolver returned
// rather than hardcoding one metric's columns.
function EvidenceTable({ rows, t }: { rows: Record<string, unknown>[]; t: ScorecardTheme }) {
  if (!rows?.length) {
    return <p className="text-[12px]" style={{ color: UI.inkMuted }}>No underlying records for this period.</p>;
  }
  const cols = Object.keys(rows[0]).filter((c) => !c.endsWith("_id"));
  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "✓" : "✕";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      return new Date(v).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
    }
    return String(v);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ borderBottom: `1px solid ${UI.divider}` }}>
            {cols.map((c) => (
              <th key={c} className="text-left py-1.5 pr-4 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: UI.inkMuted }}>
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: UI.divider }}>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="py-1.5 pr-4" style={{ color: r.on_time === false ? t.critical : UI.inkSecondary }}>
                  {fmt(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GRID = "minmax(180px,1.4fr) 70px minmax(150px,1fr) 62px minmax(120px,1fr) 92px";

export function MyScorecardPage() {
  const { user } = useUser();
  const t = useScorecardTheme();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [card, setCard] = useState<Scorecard | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("kpi_periods").select("id,label,status").order("start_date", { ascending: false });
      const rows = (data ?? []) as Period[];
      setPeriods(rows);
      if (rows.length) setPeriodId((p) => p || rows[0].id);
      else setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user?.id || !periodId) return;
    setLoading(true);
    (async () => {
      const [cardRes, histRes] = await Promise.all([
        supabase.rpc("get_kpi_scorecard", { p_user_id: user.id, p_period_id: periodId }),
        supabase.rpc("get_kpi_score_history", { p_user_id: user.id, p_limit: 6 }),
      ]);
      if (!cardRes.error) setCard(cardRes.data as Scorecard);
      if (!histRes.error) setHistory((histRes.data ?? []) as HistoryPoint[]);
      setLoading(false);
    })();
  }, [user?.id, periodId]);

  const coverage = card ? Number(card.scored_on_pct) : 0;
  const provisional = card?.score != null && coverage < PROVISIONAL_COVERAGE_PCT;

  // A provisional period is not a comparable number. Scoring 100 on 15% of the
  // card and 61.2 on all of it are not two points on the same line, and plotting
  // them together draws a collapse that never happened.
  const comparable = useMemo(
    () => history.filter((h) => h.score != null && Number(h.scored_on_pct) >= PROVISIONAL_COVERAGE_PCT),
    [history],
  );
  const omitted = history.length - comparable.length;

  const previous = useMemo(() => {
    const i = comparable.findIndex((h) => h.period_id === periodId);
    const upto = i === -1 ? comparable.length : i;
    return upto > 0 ? Number(comparable[upto - 1].score) : null;
  }, [comparable, periodId]);

  const kpis = card?.kpis ?? [];
  const maxWeight = Math.max(...kpis.map((k) => Number(k.weight_pct)), 1);
  const scored = kpis.filter((k) => !k.excluded);
  const onTarget = scored.filter((k) => (k.rating ?? 0) >= 4).length;
  const forfeited = scored.reduce(
    (a, k) => a + (Number(k.weight_pct) - Number(k.weighted_score ?? 0)), 0);
  // Points moved, and the same move as a percentage. NeuronKPICard's `trend`
  // renders with a % sign, so it must be given a real percentage change; feeding
  // it a point difference would label "8.8 points" as "8.8%".
  const deltaPoints = card?.score != null && previous != null
    ? Math.round((Number(card.score) - previous) * 10) / 10 : undefined;
  const deltaPct = card?.score != null && previous != null && previous !== 0
    ? Math.round(((Number(card.score) - previous) / previous) * 1000) / 10 : undefined;

  const trend: TrendPoint[] = useMemo(
    () => comparable.map((h) => ({
      label: new Date(`${h.label}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short" }),
      score: Number(h.score),
    })),
    [comparable],
  );

  if (loading && !card) {
    return <div className="p-8 text-[13px]" style={{ color: UI.inkMuted }}>Loading your scorecard…</div>;
  }

  if (card && !card.has_scorecard) {
    return (
      <div className="p-8">
        <h1 className="mb-1" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-1.2px", color: UI.ink }}>
          My Scorecard
        </h1>
        <div className="rounded-xl p-6 mt-6" style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
          <p className="text-[14px] mb-1" style={{ color: UI.ink }}>No scorecard applies to your department yet.</p>
          <p className="text-[13px]" style={{ color: UI.inkMuted }}>
            Falcons scorecards cover Brokerage, Forwarding, Trucking, Pricing and Business Development.
          </p>
        </div>
      </div>
    );
  }

  const expandedKpi = kpis.find((k) => k.definition_id === expanded);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between" style={{ marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-1.2px", marginBottom: 4, color: UI.ink }}>
            My Scorecard
          </h1>
          <p className="text-[14px]" style={{ color: UI.inkMuted }}>
            {card ? `${card.user_name}${card.position ? ` · ${card.position}` : ""}` : "Your performance this period"}
          </p>
        </div>
        <CustomDropdown
          value={periodId}
          onChange={setPeriodId}
          options={periods.map((p) => ({
            value: p.id, label: p.status === "open" ? `${p.label} · live` : p.label,
          }))}
          placeholder="Period"
        />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <NeuronKPICard
          icon={Gauge}
          label={provisional ? "Score (provisional)" : "Overall Score"}
          value={card?.score ?? "—"}
          suffix="/ 100"
          progress={card?.score ?? 0}
          trend={deltaPct}
          severity={card?.score == null || provisional ? "normal"
                    : card.score < 60 ? "danger" : card.score < 70 ? "warning" : "normal"}
        />
        <NeuronKPICard
          icon={TrendingDown}
          label="Points Forfeited"
          value={Math.round(forfeited * 10) / 10}
          suffix="/ 100"
          severity={forfeited >= 30 ? "danger" : forfeited >= 15 ? "warning" : "normal"}
        />
        <NeuronKPICard
          icon={CheckCircle2}
          label="KPIs At or Above Target"
          value={onTarget}
          suffix={`/ ${scored.length}`}
          progress={scored.length ? (onTarget / scored.length) * 100 : 0}
        />
        <NeuronKPICard
          icon={Target}
          label="Scorecard Measured"
          value={coverage}
          suffix="% of weight"
          progress={coverage}
          detail={card?.excluded_count ? `${card.excluded_count} excluded` : undefined}
        />
      </div>

      <div className="rounded-xl p-6 mb-6" style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[13px] font-medium" style={{ color: UI.ink }}>Where you stand</span>
          {deltaPoints !== undefined && !provisional && (
            <span className="text-[12px]" style={{ color: UI.inkMuted }}>
              {deltaPoints >= 0 ? "▲" : "▼"} {Math.abs(deltaPoints)} points vs last period
            </span>
          )}
        </div>
        <BandLadder score={card?.score ?? null} previous={previous} provisional={provisional} t={t} />
        {coverage < 100 && card && (
          <p className="text-[12px] mt-4" style={{ color: UI.inkMuted }}>
            {provisional && <strong style={{ color: UI.ink }}>Too little measured yet for a meaningful score. </strong>}
            Scored on {coverage}% of your scorecard. {card.excluded_count}{" "}
            {card.excluded_count === 1 ? "item is" : "items are"} excluded, so they are left out rather than
            counted as zero.
          </p>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden mb-6"
           style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
        <div className="grid gap-3 px-6 py-3 border-b"
             style={{ gridTemplateColumns: GRID, backgroundColor: UI.page, borderColor: UI.divider }}>
          {["KPI", "Weight", "Actual", "Rating", "Contribution", "Points"].map((h, i) => (
            <div key={h} className="text-[11px] font-medium uppercase tracking-wide"
                 style={{ color: UI.inkMuted, textAlign: i === 1 || i === 5 ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>

        <div className="divide-y" style={{ borderColor: UI.divider }}>
          {kpis.map((k) => {
            const expandable = (k.evidence?.length ?? 0) > 0;
            const open = expanded === k.definition_id;
            return (
              <div key={k.definition_id}>
                <div
                  className="grid gap-3 px-6 py-3.5 items-center"
                  style={{ gridTemplateColumns: GRID, cursor: expandable ? "pointer" : "default",
                           opacity: k.excluded ? 0.62 : 1 }}
                  onClick={() => expandable && setExpanded(open ? null : k.definition_id)}
                >
                  <div className="flex items-center min-w-0">
                    {expandable
                      ? (open ? <ChevronDown size={13} style={{ color: UI.inkMuted }} />
                              : <ChevronRight size={13} style={{ color: UI.inkMuted }} />)
                      : <span style={{ width: 13 }} />}
                    <span className="text-[13px] font-medium truncate ml-1.5" style={{ color: UI.ink }}>
                      {k.name}
                    </span>
                    <RuleTooltip kpi={k} />
                  </div>
                  <div className="text-[13px] text-right" style={{ color: UI.inkSecondary }}>
                    {Number(k.weight_pct)}%
                  </div>
                  <div className="text-[13px] truncate" style={{ color: UI.inkSecondary }}>
                    {k.actual_display ?? "—"}
                  </div>
                  <div>
                    {k.excluded
                      ? <span className="text-[11px]" style={{ color: UI.inkMuted }}>—</span>
                      : <RatingPill rating={k.rating} t={t} />}
                    {k.is_override && (
                      <span className="text-[11px] ml-1" style={{ color: UI.accent }}
                            title={k.override_reason ?? "Adjusted by evaluator"}>*</span>
                    )}
                  </div>
                  <div>
                    <ContributionBar weight={Number(k.weight_pct)}
                                     earned={k.weighted_score == null ? null : Number(k.weighted_score)}
                                     max={maxWeight} excluded={k.excluded} t={t} />
                  </div>
                  <div className="text-[13px] text-right" style={{ color: UI.ink, fontVariantNumeric: "tabular-nums" }}>
                    {k.excluded
                      ? <span className="text-[11px]" style={{ color: UI.inkMuted }}>excluded</span>
                      : `${Number(k.weighted_score).toFixed(1)} / ${Number(k.weight_pct)}`}
                  </div>
                </div>

                {k.excluded && k.excluded_reason && (
                  <div className="px-6 pb-3 text-[11px]" style={{ color: UI.inkMuted, marginLeft: 20 }}>
                    {k.excluded_reason}
                  </div>
                )}
                {open && expandedKpi && (
                  <div className="px-6 pb-5 pt-1" style={{ backgroundColor: UI.page }}>
                    <EvidenceTable rows={expandedKpi.evidence} t={t} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t text-[11px]" style={{ borderColor: UI.divider, color: UI.inkMuted }}>
          Bar length is the KPI's weight and the fill is what you earned, so a long bar matters more than a
          full one. Falcons scale: 5 exceeds target, 4 fully meets it, 3 is 90 to 99 percent, 2 is 70 to 89,
          1 is below 70.
        </div>
      </div>

      <div className="rounded-xl p-6" style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
        <p className="text-[13px] font-medium mb-4" style={{ color: UI.ink }}>Trend</p>
        <ScoreTrend points={trend} t={t} />
        {omitted > 0 && (
          <p className="text-[11px] mt-3" style={{ color: UI.inkMuted }}>
            {omitted} earlier {omitted === 1 ? "period is" : "periods are"} not plotted: too little of the
            scorecard was measured to compare.
          </p>
        )}
      </div>
    </div>
  );
}
