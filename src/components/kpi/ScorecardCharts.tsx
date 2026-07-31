import { useEffect, useState } from "react";
import {
  BANDS, bandIndex, gapToNextBand, statusColor,
  DARK, LIGHT, UI, type ScorecardTheme,
} from "./scorecardTokens";

// The marks the scorecard is built from. Per docs/KPI_SCORECARD_DESIGN_BRIEF.md.
//
// Chrome uses the app's CSS variables so these sit inside Neuron's existing
// module language rather than beside it. Only the band ramp and the status
// marker come from the validated palette.
//
// Geometry is percentage-based HTML rather than SVG: the scales are linear, text
// stays crisp at any width, and it reflows without a ResizeObserver.

/**
 * Which ramp to draw with, decided by the surface the charts actually sit on.
 *
 * Not `.dark` on <html>: the workspace theme resolves to inline CSS variables on
 * :root, and those beat the class-based rules in globals.css. Keying off the
 * class alone flips the band ramp to its dark steps while the page around it
 * stays light.
 *
 * Reading the resolved surface is also what the palette was validated against,
 * so the check and the validation agree by construction.
 */
function surfaceIsDark(): boolean {
  if (typeof window === "undefined") return false;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-bg-surface").trim();
  const m = raw.match(/^#?([0-9a-f]{6})$/i) ?? raw.match(/rgba?\(([^)]+)\)/i);
  if (!m) return document.documentElement.classList.contains("dark");
  let r: number, g: number, b: number;
  if (raw.startsWith("#") || /^[0-9a-f]{6}$/i.test(raw)) {
    const h = m[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
  }
  // Rec. 601 luma is plenty for a light/dark decision.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

export function useScorecardTheme(): ScorecardTheme {
  const [dark, setDark] = useState(surfaceIsDark);
  useEffect(() => {
    const sync = () => setDark(surfaceIsDark());
    sync();
    const o = new MutationObserver(sync);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => o.disconnect();
  }, []);
  return dark ? DARK : LIGHT;
}

function Tip({ text }: { text: string }) {
  return (
    <span
      className="absolute z-50 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1"
      style={{
        left: "50%", bottom: "calc(100% + 8px)",
        background: UI.ink, color: UI.surface,
        fontSize: 11, lineHeight: "14px", pointerEvents: "none",
      }}
    >
      {text}
    </span>
  );
}

// ─── Band ladder ─────────────────────────────────────────────────────────────
//
// "Where do I stand" is a positional question, so the score is positioned rather
// than enlarged. Band fills are the sequential neutral ramp; the marker is the
// only saturated thing on the surface.
//
// Band names are not printed inside the segments: four of the five are ten points
// wide and would collide at any realistic width. The current band is named beside
// the score, and every segment names itself on hover.

const TICKS = [0, 60, 70, 80, 90, 100];

export function BandLadder({
  score, previous, provisional, t,
}: {
  score: number | null;
  previous?: number | null;
  provisional?: boolean;
  t: ScorecardTheme;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const idx = score == null ? -1 : bandIndex(score);
  const marker = score == null ? UI.inkMuted : statusColor(score, t);
  const gap = score == null || provisional ? null : gapToNextBand(score);

  return (
    <div style={{ paddingTop: 6 }}>
      <div className="relative flex" style={{ height: 14, gap: 2 }}>
        {BANDS.map((b, i) => {
          const next = BANDS[i + 1]?.min ?? 100;
          return (
            <div
              key={b.label}
              className="relative"
              style={{
                flex: next - b.min,
                background: t.band[i],
                borderRadius: 4,
                outline: i === idx && !provisional ? `1.5px solid ${marker}` : "none",
                outlineOffset: 2,
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && <Tip text={`${b.label} · ${b.min} to ${next}`} />}
            </div>
          );
        })}

        {/* Ghost marker: last period, so direction is legible without a second chart. */}
        {previous != null && score != null && (
          <div
            className="absolute"
            style={{
              left: `${previous}%`, top: -3, width: 8, height: 8, marginLeft: -4,
              borderRadius: 999, border: `1.5px solid ${UI.inkMuted}`, background: UI.surface,
            }}
            title={`${previous} last period`}
          />
        )}

        {score != null && (
          <div
            className="absolute"
            style={{
              left: `${Math.min(Math.max(score, 0), 100)}%`, top: -5, marginLeft: -5,
              width: 10, height: 24,
              background: provisional ? "transparent" : marker,
              border: `2px solid ${marker}`,
              borderRadius: 4,
            }}
          />
        )}
      </div>

      <div className="relative" style={{ height: 14, marginTop: 10 }}>
        {TICKS.map((v) => (
          <span
            key={v}
            className="absolute text-[11px]"
            style={{
              left: `${v}%`,
              transform: v === 0 ? "none" : v === 100 ? "translateX(-100%)" : "translateX(-50%)",
              color: UI.inkMuted, fontVariantNumeric: "tabular-nums",
            }}
          >
            {v}
          </span>
        ))}
      </div>

      <div className="flex items-baseline flex-wrap" style={{ gap: 10, marginTop: 16 }}>
        <span
          className="text-2xl font-bold"
          style={{ color: marker, fontVariantNumeric: "tabular-nums" }}
        >
          {score ?? "—"}
        </span>
        <span className="text-[13px] font-medium" style={{ color: provisional ? UI.inkMuted : marker }}>
          {score == null ? "Not yet scored" : provisional ? "Provisional" : BANDS[idx].label}
        </span>
        {gap && (
          <span className="text-[12px]" style={{ color: UI.inkMuted }}>
            {gap.points} to {gap.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Weighted contribution bar ───────────────────────────────────────────────
//
// Used inside the KPI table's Contribution column. Track length = weight, fill =
// points earned, both on ONE shared axis across rows.
//
// This is the load-bearing idea of the brief. A per-KPI 0-100% bar would render
// Sales Quota at 100% and Quotation TAT at 40% as comparable marks, hiding that
// one is 15 points of the scorecard and the other is 35.

export function ContributionBar({
  weight, earned, max, excluded, t,
}: {
  weight: number; earned: number | null; max: number; excluded: boolean; t: ScorecardTheme;
}) {
  const trackPct = (weight / max) * 100;
  const fillPct = excluded || earned == null ? 0 : (earned / max) * 100;
  return (
    <span className="relative block" style={{ height: 8 }}>
      <span
        className="absolute block rounded-full"
        style={{ left: 0, top: 0, height: 8, width: `${trackPct}%`, background: UI.divider }}
      />
      {fillPct > 0 && (
        <span
          className="absolute block rounded-full"
          style={{ left: 0, top: 0, height: 8, width: `${fillPct}%`, background: t.good }}
        />
      )}
    </span>
  );
}

// ─── Strip plot ──────────────────────────────────────────────────────────────
//
// The executive hero. One dot per person, one row per department, median as a
// tick.
//
// This is the only mark that separates a person problem from a process problem
// visually: a tight low cluster means the department is constrained and the fix
// is upstream; a wide spread with one straggler means an individual. A ranked
// list of names cannot express that difference at all.

export interface StripPerson {
  user_id: string; name: string; score: number | null; provisional: boolean;
}

export function StripPlot({
  people, median, t, onPick,
}: {
  people: StripPerson[]; median: number | null; t: ScorecardTheme;
  onPick?: (userId: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const plotted = people.filter((p) => p.score != null);

  return (
    <div className="relative" style={{ height: 34 }}>
      <div className="absolute" style={{ left: 0, right: 0, top: 16, height: 1, background: UI.divider }} />
      {[60, 70, 80, 90].map((v) => (
        <div key={v} className="absolute"
             style={{ left: `${v}%`, top: 10, width: 1, height: 13, background: UI.divider }} />
      ))}

      {median != null && (
        <div
          className="absolute"
          style={{ left: `${median}%`, top: 4, width: 2, height: 25, marginLeft: -1,
                   background: UI.inkMuted, borderRadius: 1 }}
          title={`Department median ${median}`}
        />
      )}

      {plotted.map((p) => {
        const c = statusColor(p.score!, t);
        return (
          <button
            key={p.user_id}
            type="button"
            className="absolute rounded-full"
            style={{
              left: `${p.score}%`, top: 11, width: 11, height: 11, marginLeft: -5.5,
              background: p.provisional ? "transparent" : c,
              border: `2px solid ${c}`,
              boxShadow: `0 0 0 1.5px ${UI.surface}`,
              cursor: onPick ? "pointer" : "default",
              zIndex: hover === p.user_id ? 30 : 10,
            }}
            onMouseEnter={() => setHover(p.user_id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick?.(p.user_id)}
          >
            {hover === p.user_id && (
              <Tip text={`${p.name} · ${p.score}${p.provisional ? " · provisional" : ""}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Band composition ────────────────────────────────────────────────────────
//
// How many people sit in each band, as one ordered stacked bar. Answers "how
// many are in trouble" without averaging it away. Uses the same sequential ramp
// as the ladder, so the two marks agree.

export function BandComposition({
  counts, total, t,
}: {
  counts: number[]; total: number; t: ScorecardTheme;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!total) {
    return <span className="text-[11px]" style={{ color: UI.inkMuted }}>Nobody scored yet</span>;
  }
  return (
    <div className="relative flex" style={{ height: 10, gap: 2 }}>
      {counts.map((n, i) =>
        n === 0 ? null : (
          <div
            key={i}
            className="relative rounded-full"
            style={{ flex: n, background: t.band[i], minWidth: 4 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && <Tip text={`${BANDS[i].label} · ${n} ${n === 1 ? "person" : "people"}`} />}
          </div>
        ),
      )}
    </div>
  );
}

// ─── Trend ───────────────────────────────────────────────────────────────────
//
// Direction, the other half of "where do I stand".

export interface TrendPoint { label: string; score: number | null }

export function ScoreTrend({ points, t }: { points: TrendPoint[]; t: ScorecardTheme }) {
  const real = points.filter((p) => p.score != null);
  if (real.length < 2) {
    return (
      <p className="text-[12px]" style={{ color: UI.inkMuted }}>
        First period measured. A trend appears once there are two.
      </p>
    );
  }

  // Fixed domain rather than fit-to-data: a trend that rescales itself makes an
  // 8-point slip and a 40-point collapse look identical. Band thresholds are the
  // reference, so the axis has to hold still.
  // 120px keeps the four band gridlines (60/70/80/90) about 20px apart, so their
  // labels do not collide. At 72 they stacked into an unreadable clump.
  const H = 120, LO = 40, HI = 100, GUTTER = 28;
  const yPct = (s: number) => (1 - (Math.min(Math.max(s, LO), HI) - LO) / (HI - LO)) * 100;
  const xPct = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  const last = points.length - 1;

  // The line is SVG on a stretched viewBox; the end marker is HTML positioned in
  // percent. A circle inside a non-uniformly scaled viewBox renders as an ellipse.
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xPct(i)},${yPct(p.score!)}`).join(" ");

  return (
    <div>
      <div className="relative" style={{ height: H }}>
        {[60, 70, 80, 90].map((v) => (
          <div key={v} className="absolute" style={{ left: 0, right: GUTTER, top: `${yPct(v)}%` }}>
            <div style={{ borderTop: `1px dashed ${UI.divider}` }} />
            <span
              className="absolute text-[10px]"
              style={{ right: -GUTTER, top: -7, color: UI.inkMuted, fontVariantNumeric: "tabular-nums" }}
            >
              {v}
            </span>
          </div>
        ))}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: `calc(100% - ${GUTTER}px)`,
                   height: "100%", overflow: "visible" }}
        >
          <path d={path} fill="none" stroke={t.good} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>

        <div
          className="absolute rounded-full"
          style={{
            left: `calc(${xPct(last)}% - ${(xPct(last) / 100) * GUTTER}px)`,
            top: `${yPct(points[last].score!)}%`,
            width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5,
            background: t.good, boxShadow: `0 0 0 2px ${UI.surface}`,
          }}
          title={`${points[last].label} · ${points[last].score}`}
        />
      </div>

      <div className="flex justify-between" style={{ marginTop: 8, paddingRight: GUTTER }}>
        {points.map((p) => (
          <span key={p.label} className="text-[11px]" style={{ color: UI.inkMuted }}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}
