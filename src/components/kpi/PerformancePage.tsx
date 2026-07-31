import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "../../utils/supabase/client";
import { CustomDropdown } from "../bd/CustomDropdown";
import { NeuronKPICard } from "../ui/NeuronKPICard";
import { AlertTriangle, ArrowLeft, Search, Users, Gauge, TriangleAlert, Target } from "lucide-react";
import { BandComposition, BandLadder, StripPlot, useScorecardTheme, type StripPerson } from "./ScorecardCharts";
import { BANDS, UI, bandIndex, statusColor } from "./scorecardTokens";
import { ReviewPanel, type ReviewKpi } from "./ReviewPanel";

// Performance — the executive surface. Per docs/KPI_SCORECARD_DESIGN_BRIEF.md.
//
// Different job from My Scorecard: 39 people across five scorecards, and the
// question is DISTRIBUTION, not score. The order of the page is deliberate —
// distribution, then systemic flags, then names. A ranked list of everyone is
// available but is not what the page opens with, because "who is worst" should
// not be the first thing this surface teaches you to ask.
//
// Access: gated on hr_performance:view, which is also what widens
// get_kpi_scorecard past the caller's own card.

interface Person {
  user_id: string;
  name: string;
  position: string | null;
  scorecard_key: string;
  score: number | null;
  band: string | null;
  coverage: number;
  provisional: boolean;
  ratings: Record<string, number | null>;
}

interface Overview {
  period: { id: string; label: string; status: string };
  systemic_pct: number;
  people: Person[];
}

interface Period { id: string; label: string; status: string }

const DEPT_LABEL: Record<string, string> = {
  brokerage: "Brokerage", forwarding: "Forwarding", trucking: "Trucking",
  pricing: "Pricing", bdd: "Business Development",
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(v * 10) / 10;
}

export function PerformancePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const t = useScorecardTheme();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [card, setCard] = useState<{ kpis: ReviewKpi[] } | null>(null);
  const [canEvaluate, setCanEvaluate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase
        .from("kpi_periods").select("id,label,status").order("start_date", { ascending: false });
      const rows = (p ?? []) as Period[];
      setPeriods(rows);
      if (rows.length) setPeriodId((v) => v || rows[0].id);
      else setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!periodId) return;
    setLoading(true);
    (async () => {
      const { data: d, error } = await supabase.rpc("get_kpi_org_overview", { p_period_id: periodId });
      if (error) setDenied(true);
      else { setData(d as Overview); setDenied(false); }
      setLoading(false);
    })();
    // reloadKey: saving a rating changes the score behind the ladder and the
    // department distribution, so the overview has to come back too.
  }, [periodId, reloadKey]);

  // The overview carries only summary rows. Opening one person needs their full
  // card, and the Review panel needs to know whether this viewer may evaluate.
  useEffect(() => {
    if (!userId || !periodId) { setCard(null); return; }
    (async () => {
      const [c, perm] = await Promise.all([
        supabase.rpc("get_kpi_scorecard", { p_user_id: userId, p_period_id: periodId }),
        supabase.rpc("kpi_can_evaluate"),
      ]);
      if (!c.error) setCard(c.data as { kpis: ReviewKpi[] });
      setCanEvaluate(perm.data === true);
    })();
  }, [userId, periodId, reloadKey]);

  const people = data?.people ?? [];

  const departments = useMemo(() => {
    const keys = [...new Set(people.map((p) => p.scorecard_key))].sort(
      (a, b) => (DEPT_LABEL[a] ?? a).localeCompare(DEPT_LABEL[b] ?? b));
    return keys.map((key) => {
      const members = people.filter((p) => p.scorecard_key === key);
      const scored = members.filter((p) => p.score != null);
      // Provisional scores are plotted (hollow) but do NOT drive the median or
      // the band composition. A 100 computed on 15% of a scorecard is not
      // comparable to a 61.2 computed on all of it, and six of them would drag a
      // department median to 100 while telling you nothing.
      const firm = scored.filter((p) => !p.provisional);
      const med = median(firm.map((p) => Number(p.score)));
      const counts = [0, 0, 0, 0, 0];
      firm.forEach((p) => { counts[bandIndex(Number(p.score))] += 1; });
      return { key, label: DEPT_LABEL[key] ?? key, members, scored, firm, median: med, counts };
    }).sort((a, b) => (b.median ?? -1) - (a.median ?? -1));
  }, [people]);

  // Systemic detection: when a majority of a department's SCORED members miss the
  // same KPI, the constraint is upstream and coaching individuals is the wrong
  // response. Expressed as a share so it reads the same for a team of 2 and 21.
  const systemic = useMemo(() => {
    const out: { dept: string; kpi: string; below: number; total: number; pct: number }[] = [];
    const threshold = Number(data?.systemic_pct ?? 60);
    departments.forEach((d) => {
      const names = new Set<string>();
      d.firm.forEach((p) => Object.keys(p.ratings ?? {}).forEach((k) => names.add(k)));
      names.forEach((kpi) => {
        const rated = d.firm.filter((p) => p.ratings?.[kpi] != null);
        if (rated.length < 3) return; // too few to call it a pattern
        const below = rated.filter((p) => Number(p.ratings[kpi]) < 4).length;
        const pct = Math.round((below / rated.length) * 100);
        if (pct >= threshold) out.push({ dept: d.label, kpi, below, total: rated.length, pct });
      });
    });
    return out.sort((a, b) => b.pct - a.pct);
  }, [departments, data]);

  const scoredAll = people.filter((p) => p.score != null);
  const firmAll = scoredAll.filter((p) => !p.provisional);
  const companyMedian = median(firmAll.map((p) => Number(p.score)));
  const belowTarget = firmAll.filter((p) => Number(p.score) < 70).length;
  const provisionalCount = scoredAll.length - firmAll.length;

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = people.map((p) => {
      const d = departments.find((x) => x.key === p.scorecard_key);
      return { ...p, deptLabel: d?.label ?? p.scorecard_key, deptMedian: d?.median ?? null };
    });
    return (q ? rows.filter((r) => r.name.toLowerCase().includes(q)
                                || (r.position ?? "").toLowerCase().includes(q)
                                || r.deptLabel.toLowerCase().includes(q)) : rows)
      // Department then name: the page should not open on a ranking.
      .sort((a, b) => a.deptLabel.localeCompare(b.deptLabel) || a.name.localeCompare(b.name));
  }, [people, departments, query]);

  const selected = userId ? people.find((p) => p.user_id === userId) ?? null : null;
  const selectedDept = selected ? departments.find((d) => d.key === selected.scorecard_key) : null;

  if (denied) {
    return (
      <div className="p-8">
        <h1 className="mb-1" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-1.2px", color: UI.ink }}>
          Performance
        </h1>
        <div className="rounded-xl p-6 mt-6" style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
          <p className="text-[14px]" style={{ color: UI.ink }}>
            You do not have access to other people's scorecards.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="p-8 text-[13px]" style={{ color: UI.inkMuted }}>Loading performance…</div>;
  }

  // ─── Individual view ───────────────────────────────────────────────────────
  if (selected) {
    const peers = (selectedDept?.firm ?? []).map((p) => Number(p.score));
    const vsMedian = selected.score != null && selectedDept?.median != null
      ? Math.round((Number(selected.score) - selectedDept.median) * 10) / 10 : null;
    return (
      <div className="p-8">
        <button
          type="button"
          onClick={() => navigate("/hr/performance")}
          className="inline-flex items-center gap-1.5 text-[13px] mb-4"
          style={{ color: UI.inkMuted }}
        >
          <ArrowLeft size={14} /> {selectedDept?.label ?? "Performance"}
        </button>

        <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-1.2px", marginBottom: 4, color: UI.ink }}>
          {selected.name}
        </h1>
        <p className="text-[14px] mb-8" style={{ color: UI.inkMuted }}>
          {[selected.position, selectedDept?.label].filter(Boolean).join(" · ")}
        </p>

        <div className="rounded-xl p-6 mb-6" style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
          <BandLadder score={selected.score == null ? null : Number(selected.score)}
                      provisional={selected.provisional} t={t} />
        </div>

        {/* Context, not a bare number. 58 against a department median of 76 is a
            person problem; 58 against a median of 60 is a process problem wearing
            somebody's name. */}
        <div className="grid grid-cols-3 gap-4">
          <NeuronKPICard icon={Users} label={`${selectedDept?.label ?? "Department"} median`}
                         value={selectedDept?.median ?? "—"} suffix="/ 100" />
          <NeuronKPICard icon={Gauge} label="This person vs median"
                         value={vsMedian == null ? "—" : `${vsMedian >= 0 ? "+" : ""}${vsMedian}`}
                         suffix="points"
                         severity={vsMedian != null && vsMedian < -10 ? "danger"
                                   : vsMedian != null && vsMedian < 0 ? "warning" : "normal"} />
          <NeuronKPICard icon={Target} label="Department range"
                         value={peers.length ? `${Math.min(...peers)}–${Math.max(...peers)}` : "—"}
                         detail={`${peers.length} scored`} />
        </div>

        <p className="text-[12px] mt-6 mb-6" style={{ color: UI.inkMuted }}>
          Scored on {Number(selected.coverage)}% of the scorecard
          {selected.provisional ? " — too little measured for a meaningful score." : "."}
        </p>

        {canEvaluate && card?.kpis && (
          <ReviewPanel
            userId={selected.user_id}
            periodId={periodId}
            kpis={card.kpis}
            t={t}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
        )}
      </div>
    );
  }

  // ─── Overview ──────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      <div className="flex items-center justify-between" style={{ marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-1.2px", marginBottom: 4, color: UI.ink }}>
            Performance
          </h1>
          <p className="text-[14px]" style={{ color: UI.inkMuted }}>
            How each department is performing, and whether a low score is a person or a process
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
        <NeuronKPICard icon={Gauge} label="Company Median" value={companyMedian ?? "—"} suffix="/ 100"
                       progress={companyMedian ?? 0} />
        <NeuronKPICard icon={Users} label="People Measured" value={firmAll.length}
                       suffix={`/ ${people.length}`}
                       detail={provisionalCount ? `${provisionalCount} provisional` : undefined}
                       progress={people.length ? (firmAll.length / people.length) * 100 : 0} />
        <NeuronKPICard icon={TriangleAlert} label="Below Satisfactory" value={belowTarget}
                       suffix={`/ ${firmAll.length}`}
                       severity={belowTarget > firmAll.length / 2 ? "danger" : belowTarget ? "warning" : "normal"} />
        <NeuronKPICard icon={AlertTriangle} label="Systemic Flags" value={systemic.length}
                       detail={systemic.length ? "process, not people" : undefined}
                       severity={systemic.length ? "warning" : "normal"} />
      </div>

      {/* Hero: distribution before names. */}
      <div className="rounded-2xl overflow-hidden mb-6"
           style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
        <div className="px-6 py-3 border-b flex items-baseline justify-between"
             style={{ backgroundColor: UI.page, borderColor: UI.divider }}>
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: UI.inkMuted }}>
            Distribution by department
          </span>
          <span className="text-[11px]" style={{ color: UI.inkMuted }}>
            each dot is one person · line is the department median
          </span>
        </div>

        {/* Absolute percent positions, matching the plot. justify-between spaces
            the labels EVENLY, which put "60" at 20% of the width while the real
            60 tick sat at 60% — an axis that disagrees with its own marks. */}
        <div className="px-6 pt-5 pb-1">
          <div className="grid" style={{ gridTemplateColumns: "168px 1fr 66px" }}>
            <div />
            <div className="relative" style={{ height: 14 }}>
              {[0, 60, 70, 80, 90, 100].map((v) => (
                <span
                  key={v}
                  className="absolute text-[10px]"
                  style={{
                    left: `${v}%`,
                    transform: v === 0 ? "none" : v === 100 ? "translateX(-100%)" : "translateX(-50%)",
                    color: UI.inkMuted,
                  }}
                >
                  {v}
                </span>
              ))}
            </div>
            <div />
          </div>
        </div>

        <div className="divide-y" style={{ borderColor: UI.divider }}>
          {departments.map((d) => (
            <div key={d.key} className="grid items-center px-6 py-3"
                 style={{ gridTemplateColumns: "168px 1fr 66px", gap: 0 }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: UI.ink }}>{d.label}</div>
                <div className="text-[11px]" style={{ color: UI.inkMuted }}>
                  {d.firm.length} of {d.members.length} measured
                </div>
              </div>
              <StripPlot
                people={d.members as StripPerson[]}
                median={d.median}
                t={t}
                onPick={(id) => navigate(`/hr/performance/${id}`)}
              />
              <div className="text-[13px] text-right"
                   style={{ color: d.median == null ? UI.inkMuted : statusColor(d.median, t),
                            fontVariantNumeric: "tabular-nums" }}>
                {d.median ?? "—"}
              </div>
            </div>
          ))}
        </div>

        <div className="divide-y border-t" style={{ borderColor: UI.divider }}>
          {departments.map((d) => (
            <div key={d.key} className="grid items-center px-6 py-2.5"
                 style={{ gridTemplateColumns: "168px 1fr 66px", gap: 0 }}>
              <span className="text-[12px]" style={{ color: UI.inkMuted }}>{d.label}</span>
              <BandComposition counts={d.counts} total={d.firm.length} t={t} />
              <span className="text-[11px] text-right" style={{ color: UI.inkMuted }}>{d.firm.length}</span>
            </div>
          ))}
        </div>

        <div className="px-6 py-2.5 border-t flex gap-4 flex-wrap"
             style={{ borderColor: UI.divider, backgroundColor: UI.page }}>
          {BANDS.map((b, i) => (
            <span key={b.label} className="inline-flex items-center gap-1.5 text-[11px]"
                  style={{ color: UI.inkMuted }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: t.band[i] }} />
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {systemic.length > 0 && (
        <div className="rounded-xl p-6 mb-6" style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={15} style={{ color: t.warning }} />
            <span className="text-[13px] font-medium" style={{ color: UI.ink }}>
              Not a people problem
            </span>
          </div>
          <p className="text-[12px] mb-4" style={{ color: UI.inkMuted }}>
            When most of a department misses the same KPI, the constraint is upstream.
          </p>
          <div className="divide-y" style={{ borderColor: UI.divider }}>
            {systemic.map((s) => (
              <div key={`${s.dept}-${s.kpi}`} className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[13px]" style={{ color: UI.ink }}>
                  {s.dept} · <span style={{ color: UI.inkSecondary }}>{s.kpi}</span>
                </span>
                <span className="text-[12px] shrink-0" style={{ color: t.warning }}>
                  {s.below} of {s.total} below target
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Names last, and sorted by department rather than score. */}
      <div className="rounded-2xl overflow-hidden"
           style={{ border: `1.5px solid ${UI.border}`, background: UI.surface }}>
        <div className="px-6 py-3 border-b" style={{ borderColor: UI.divider }}>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: UI.inkMuted }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, roles or departments…"
              className="w-full pl-10 pr-4 py-2 rounded-lg text-[13px] focus:outline-none"
              style={{ background: UI.page, border: `1px solid ${UI.divider}`, color: UI.ink }}
            />
          </div>
        </div>

        <div className="grid gap-3 px-6 py-3 border-b"
             style={{ gridTemplateColumns: "minmax(200px,1.6fr) minmax(140px,1fr) 80px 90px 110px",
                      backgroundColor: UI.page, borderColor: UI.divider }}>
          {["Name", "Department", "Score", "vs Dept", "Coverage"].map((h, i) => (
            <div key={h} className="text-[11px] font-medium uppercase tracking-wide"
                 style={{ color: UI.inkMuted, textAlign: i >= 2 ? "right" : "left" }}>{h}</div>
          ))}
        </div>

        <div className="divide-y" style={{ borderColor: UI.divider }}>
          {roster.map((r) => {
            const vs = r.score != null && r.deptMedian != null
              ? Math.round((Number(r.score) - r.deptMedian) * 10) / 10 : null;
            return (
              <button
                key={r.user_id}
                type="button"
                onClick={() => navigate(`/hr/performance/${r.user_id}`)}
                className="grid gap-3 px-6 py-3 items-center w-full text-left"
                style={{ gridTemplateColumns: "minmax(200px,1.6fr) minmax(140px,1fr) 80px 90px 110px" }}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: UI.ink }}>{r.name}</div>
                  {r.position && (
                    <div className="text-[11px] truncate" style={{ color: UI.inkMuted }}>{r.position}</div>
                  )}
                </div>
                <div className="text-[13px] truncate" style={{ color: UI.inkSecondary }}>{r.deptLabel}</div>
                {/* A provisional score wears muted ink, not status colour: a 100
                    computed on 15% of a card should not read as excellent just
                    because the coverage column is the only thing saying otherwise. */}
                <div className="text-[13px] text-right" style={{ fontVariantNumeric: "tabular-nums",
                     color: r.score == null || r.provisional
                       ? UI.inkMuted : statusColor(Number(r.score), t) }}>
                  {r.score ?? "—"}
                </div>
                <div className="text-[12px] text-right" style={{ color: UI.inkMuted,
                     fontVariantNumeric: "tabular-nums" }}>
                  {r.provisional || vs == null ? "—" : `${vs >= 0 ? "+" : ""}${vs}`}
                </div>
                <div className="text-[12px] text-right" style={{ color: UI.inkMuted }}>
                  {r.score == null ? "not scored"
                    : r.provisional ? `${Number(r.coverage)}% · provisional`
                    : `${Number(r.coverage)}%`}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t text-[11px]" style={{ borderColor: UI.divider, color: UI.inkMuted }}>
          Sorted by department, not by score. A score is only comparable inside its own department, which is
          what the vs Dept column shows.
        </div>
      </div>
    </div>
  );
}
