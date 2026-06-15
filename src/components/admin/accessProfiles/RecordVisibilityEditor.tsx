import { useMemo } from "react";
import { Eye, Lock, RotateCcw } from "lucide-react";
import {
  RECORD_DIALS,
  RECORD_TYPE_GROUPS,
  ALL_RECORD_TYPES,
  isRecordTypeAccessible,
  dialFor,
  dialsForType,
  mergeVisibility,
  type RecordDial,
  type RecordType,
  type RecordVisibilityMap,
} from "./recordVisibilityConfig";

// NEU-012 Contract #6 Slice 3 — the Record Visibility tab. One row per record
// type with a dial (Own / Team / Department / All records). Rows the profile
// can't open (no view on any gating module in Feature Access) are greyed — set
// in lockstep with the Feature Access tab. Save writes an explicit dial on
// every live row.
//
// Crew Visibility Phase 1.3 (provenance): when `baseline` is provided (the
// per-user Access Configuration screen passes the assigned profile's dials),
// any row deviating from it is labeled as a personal override with a one-click
// reset — overrides must be visible and deliberate, never silent residue.

interface RecordVisibilityEditorProps {
  scopes: RecordVisibilityMap;
  onChange: (next: RecordVisibilityMap) => void;
  /** Resolved (cascaded) feature-access grants, used to grey inaccessible rows. */
  resolvedGrants: Record<string, boolean>;
  /** Per-user context only: the assigned profile's dials. Enables override
   *  provenance badges + reset affordances. Omit on the profile editor. */
  baseline?: RecordVisibilityMap;
}

// Linear-style segmented dial: a quiet hairline track with a raised thumb that
// slides to the active option. No color fill at rest — the control whispers,
// so an unusual dial position is what catches the scanning eye.
function DialControl({
  value,
  disabled,
  onSet,
  dials,
}: {
  value: RecordDial;
  disabled: boolean;
  onSet: (dial: RecordDial) => void;
  dials: typeof RECORD_DIALS;
}) {
  const activeIndex = Math.max(0, dials.findIndex((d) => d.value === value));
  return (
    <div
      role="radiogroup"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${dials.length}, 1fr)`,
        // Equal columns keep the sliding-thumb math exact; ~89px/cell preserves
        // the prior per-label width as the dial count varies per record type.
        width: dials.length * 89,
        flexShrink: 0,
        padding: 2,
        borderRadius: 8,
        border: "1px solid var(--neuron-ui-border)",
        background: "var(--neuron-bg-surface-subtle)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {/* Sliding thumb — teal on live rows; colorless on locked rows so the
          greyed records read as untouchable at a glance */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: 2,
          width: `calc((100% - 4px) / ${dials.length})`,
          borderRadius: 6,
          background: disabled ? "var(--neuron-bg-elevated)" : "var(--neuron-action-primary)",
          border: disabled ? "1px solid var(--neuron-ui-border)" : "none",
          boxShadow: disabled ? "none" : "0 1px 2px rgba(0, 0, 0, 0.16)",
          transform: `translateX(${activeIndex * 100}%)`,
          transition: "transform 0.14s cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      />
      {dials.map((d) => {
        const active = value === d.value;
        return (
          <button
            key={d.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={d.description}
            onClick={() => !disabled && onSet(d.value)}
            onMouseEnter={(e) => { if (!disabled && !active) e.currentTarget.style.color = "var(--neuron-ink-primary)"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--neuron-ink-muted)"; }}
            style={{
              position: "relative",
              zIndex: 1,
              padding: "4px 6px",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: active
                ? (disabled ? "var(--neuron-ink-muted)" : "var(--neuron-action-primary-text)")
                : "var(--neuron-ink-muted)",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "color 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

// Bulk setter — same quiet track as the dial, but momentary (no thumb): these
// are actions, not state. Always captioned so the chips never float unlabeled.
function SetAllControl({
  label,
  onSet,
}: {
  label: string;
  onSet: (dial: RecordDial) => void;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>{label || "Set all"}</span>
      <div
        style={{
          display: "inline-flex",
          gap: 2,
          padding: 2,
          borderRadius: 8,
          border: "1px solid var(--neuron-ui-border)",
          background: "var(--neuron-bg-surface-subtle)",
        }}
      >
        {RECORD_DIALS.map((d) => (
          <button
            key={d.value}
            type="button"
            title={d.description}
            onClick={() => onSet(d.value)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--neuron-bg-elevated)";
              e.currentTarget.style.color = "var(--neuron-ink-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--neuron-ink-muted)";
            }}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "var(--neuron-ink-muted)",
              cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecordVisibilityEditor({ scopes, onChange, resolvedGrants, baseline }: RecordVisibilityEditorProps) {
  const accessibleByKey = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const rt of ALL_RECORD_TYPES) map[rt.key] = isRecordTypeAccessible(rt, resolvedGrants);
    return map;
  }, [resolvedGrants]);

  const accessibleCount = useMemo(
    () => ALL_RECORD_TYPES.filter((rt) => accessibleByKey[rt.key]).length,
    [accessibleByKey],
  );

  // Provenance (per-user context): which rows deviate from the assigned profile.
  const overriddenKeys = useMemo(() => {
    if (!baseline) return new Set<string>();
    return new Set(
      ALL_RECORD_TYPES.filter((rt) => dialFor(scopes, rt.key) !== dialFor(baseline, rt.key)).map(
        (rt) => rt.key,
      ),
    );
  }, [baseline, scopes]);

  const setOne = (key: string, dial: RecordDial) => {
    onChange({ ...scopes, [key]: dial });
  };

  // Bulk setters only touch ACCESSIBLE (live) rows that actually SUPPORT the
  // chosen dial — greyed rows, and rows where the dial is invalid for that type
  // (e.g. 'org_wide' on financials, 'department' on a v2 type), keep their value.
  const setMany = (types: RecordType[], dial: RecordDial) => {
    const next: RecordVisibilityMap = { ...scopes };
    for (const rt of types) {
      if (accessibleByKey[rt.key] && dialsForType(rt.key).some((d) => d.value === dial)) {
        next[rt.key] = dial;
      }
    }
    onChange(next);
  };

  return (
    <div>
      {/* Intro + master set-all */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid var(--neuron-ui-border)",
          background: "var(--neuron-bg-surface-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
          <Eye size={15} style={{ color: "var(--neuron-action-primary)", marginTop: 2, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12, color: "var(--neuron-ink-muted)", lineHeight: 1.5 }}>
            For each record type, choose which rows this profile sees. Only types it can open in{" "}
            <strong style={{ color: "var(--neuron-ink-primary)" }}>Feature Access</strong> are editable here.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {baseline && overriddenKeys.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(mergeVisibility(baseline, {}))}
              title="Remove all personal overrides — every dial returns to the assigned profile's value"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                borderRadius: 7, cursor: "pointer",
                border: "1px solid var(--neuron-warning-border, #F0C674)",
                background: "var(--neuron-warning-bg, #FFF8E6)",
                color: "var(--neuron-warning-ink, #8A6D1A)",
              }}
            >
              <RotateCcw size={11} />
              {overriddenKeys.size} personal {overriddenKeys.size === 1 ? "override" : "overrides"} — reset all to profile
            </button>
          )}
          {accessibleCount > 0 && (
            <SetAllControl label="Set all to" onSet={(d) => setMany(ALL_RECORD_TYPES, d)} />
          )}
        </div>
      </div>

      {/* Groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {RECORD_TYPE_GROUPS.map(({ group, types }) => {
          const liveTypes = types.filter((rt) => accessibleByKey[rt.key]);
          return (
            <div key={group}>
              {/* Group header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--neuron-ink-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {group}
                </span>
                {liveTypes.length > 0 && (
                  <SetAllControl label="" onSet={(d) => setMany(types, d)} />
                )}
              </div>

              {/* Rows */}
              <div
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {types.map((rt, i) => {
                  const accessible = accessibleByKey[rt.key];
                  const isOverridden = overriddenKeys.has(rt.key);
                  const baselineDial = baseline ? dialFor(baseline, rt.key) : null;
                  const baselineLabel = baselineDial
                    ? RECORD_DIALS.find((d) => d.value === baselineDial)?.label ?? baselineDial
                    : null;
                  return (
                    <div
                      key={rt.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 14px",
                        borderTop: i === 0 ? "none" : "1px solid var(--neuron-ui-border)",
                        background: accessible ? "var(--neuron-bg-elevated)" : "var(--neuron-bg-surface-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        {!accessible && <Lock size={12} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />}
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: accessible ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)",
                          }}
                        >
                          {rt.label}
                        </span>
                        {!accessible && (
                          <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>
                            turn on in Feature Access to use
                          </span>
                        )}
                        {isOverridden && (
                          <span
                            title={`The assigned profile says "${baselineLabel}" — this user has a personal override. Click the arrow to reset.`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "1px 7px", fontSize: 10.5, fontWeight: 600,
                              borderRadius: 99, whiteSpace: "nowrap",
                              border: "1px solid var(--neuron-warning-border, #F0C674)",
                              background: "var(--neuron-warning-bg, #FFF8E6)",
                              color: "var(--neuron-warning-ink, #8A6D1A)",
                            }}
                          >
                            override · profile: {baselineLabel}
                            <button
                              type="button"
                              onClick={() => setOne(rt.key, baselineDial as RecordDial)}
                              title={`Reset to profile (${baselineLabel})`}
                              style={{
                                display: "inline-flex", alignItems: "center",
                                border: "none", background: "transparent", padding: 0,
                                cursor: "pointer", color: "inherit",
                              }}
                            >
                              <RotateCcw size={10} />
                            </button>
                          </span>
                        )}
                      </div>
                      <DialControl
                        value={dialFor(scopes, rt.key)}
                        disabled={!accessible}
                        onSet={(d) => setOne(rt.key, d)}
                        dials={dialsForType(rt.key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
