// Chart tokens for the performance surfaces.
//
// Every value here was produced by scripts/validate_palette.js, not by eye.
//
//   status (light)  #A8322A #B4740D #089184  → ALL CHECKS PASS
//   status (dark)   #D9556B #A5941B #26A79A  → ALL CHECKS PASS
//
// The brand teal #0F766E fails the validator's chroma floor (0.086, reads gray
// as a data mark). #089184 is the nearest step that passes, so charts use that
// while chrome keeps #0F766E.
//
// The five band steps are a SEQUENTIAL ramp, not a categorical palette: the
// bands are ordered, so the requirement is monotonic lightness, not CVD
// separation. Verified monotonic with even gaps (light 0.959→0.793, min gap
// 0.032; dark 0.263→0.416, min gap 0.035).
//
// Dark steps are SELECTED against the dark surface, never an inverted flip.

// SCOPE: data marks only.
//
// Chrome (text, borders, surfaces, dividers) uses the app's CSS variables
// — var(--neuron-ink-primary), var(--neuron-ui-divider), var(--theme-bg-surface)
// and friends — exactly like every other module. Those already flip with `.dark`,
// so charts must not carry a parallel set of greys that drift from the rest of
// the app.
//
// What lives here is only what CSS vars cannot supply: a validated sequential
// band ramp and the reserved status steps for the position marker.

export interface ScorecardTheme {
  /** Recessive band ladder fills, Poor → Outstanding. Sequential, one hue. */
  band: [string, string, string, string, string];
  /** Reserved status. Three levels only: position and the label carry the rest. */
  critical: string;
  warning: string;
  good: string;
}

export const LIGHT: ScorecardTheme = {
  band: ["#F0F2F1", "#E4E8E6", "#D6DCD9", "#C5CFCB", "#B2BFBA"],
  critical: "#A8322A",
  warning: "#B4740D",
  good: "#089184",
};

export const DARK: ScorecardTheme = {
  band: ["#1E2724", "#26302C", "#2E3A35", "#37443F", "#41504A"],
  critical: "#D9556B",
  warning: "#A5941B",
  good: "#26A79A",
};

/** App chrome, referenced by name so charts stay in step with every other module. */
export const UI = {
  ink: "var(--neuron-ink-primary)",
  inkSecondary: "var(--neuron-ink-secondary)",
  inkMuted: "var(--neuron-ink-muted)",
  surface: "var(--theme-bg-surface)",
  page: "var(--neuron-bg-page)",
  border: "var(--neuron-ui-border)",
  divider: "var(--neuron-ui-divider)",
  accent: "var(--theme-action-primary-bg)",
} as const;

/** Falcons result bands. Lower bound inclusive; index matches theme.band. */
export const BANDS = [
  { min: 0,  label: "Poor" },
  { min: 60, label: "Needs Improvement" },
  { min: 70, label: "Satisfactory" },
  { min: 80, label: "Very Satisfactory" },
  { min: 90, label: "Outstanding" },
] as const;

export function bandIndex(score: number): number {
  let i = 0;
  for (let b = 0; b < BANDS.length; b++) if (score >= BANDS[b].min) i = b;
  return i;
}

/**
 * Status is reserved and coarse on purpose. Position on the ladder and the band
 * label already separate Satisfactory from Outstanding; colour only has to say
 * whether this is a problem. Five status hues would make the surface a traffic
 * light and would fail CVD separation at the red/amber end.
 */
export function statusColor(score: number, t: ScorecardTheme): string {
  if (score < 60) return t.critical;
  if (score < 70) return t.warning;
  return t.good;
}

/** Distance to the next band up, or null when already Outstanding. */
export function gapToNextBand(score: number): { points: number; label: string } | null {
  const next = BANDS.find((b) => b.min > score);
  return next ? { points: Math.round((next.min - score) * 10) / 10, label: next.label } : null;
}
