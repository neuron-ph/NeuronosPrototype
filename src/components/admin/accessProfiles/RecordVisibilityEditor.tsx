import { useMemo } from "react";
import { Eye, Lock } from "lucide-react";
import {
  RECORD_DIALS,
  RECORD_TYPE_GROUPS,
  ALL_RECORD_TYPES,
  isRecordTypeAccessible,
  dialFor,
  type RecordDial,
  type RecordType,
  type RecordVisibilityMap,
} from "./recordVisibilityConfig";

// NEU-012 Contract #6 Slice 3 — the Record Visibility tab. One row per record
// type, a 3-way dial (Own / Team / Everything). Rows the profile can't open
// (no view on any gating module in Feature Access) are greyed — set in lockstep
// with the Feature Access tab. Save writes an explicit dial on every live row.

interface RecordVisibilityEditorProps {
  scopes: RecordVisibilityMap;
  onChange: (next: RecordVisibilityMap) => void;
  /** Resolved (cascaded) feature-access grants, used to grey inaccessible rows. */
  resolvedGrants: Record<string, boolean>;
}

// Linear-style segmented dial: a quiet hairline track with a raised thumb that
// slides to the active option. No color fill at rest — the control whispers,
// so an unusual dial position is what catches the scanning eye.
function DialControl({
  value,
  disabled,
  onSet,
}: {
  value: RecordDial;
  disabled: boolean;
  onSet: (dial: RecordDial) => void;
}) {
  const activeIndex = Math.max(0, RECORD_DIALS.findIndex((d) => d.value === value));
  return (
    <div
      role="radiogroup"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${RECORD_DIALS.length}, 1fr)`,
        width: 252,
        flexShrink: 0,
        padding: 2,
        borderRadius: 8,
        border: "1px solid var(--neuron-ui-border)",
        background: "var(--neuron-bg-surface-subtle)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {/* Sliding thumb */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: 2,
          width: `calc((100% - 4px) / ${RECORD_DIALS.length})`,
          borderRadius: 6,
          background: "var(--neuron-bg-elevated)",
          border: "1px solid var(--neuron-ui-border)",
          boxShadow: disabled ? "none" : "0 1px 2px rgba(0, 0, 0, 0.16)",
          transform: `translateX(${activeIndex * 100}%)`,
          transition: "transform 0.14s cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      />
      {RECORD_DIALS.map((d) => {
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
              color: active ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)",
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

export function RecordVisibilityEditor({ scopes, onChange, resolvedGrants }: RecordVisibilityEditorProps) {
  const accessibleByKey = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const rt of ALL_RECORD_TYPES) map[rt.key] = isRecordTypeAccessible(rt, resolvedGrants);
    return map;
  }, [resolvedGrants]);

  const accessibleCount = useMemo(
    () => ALL_RECORD_TYPES.filter((rt) => accessibleByKey[rt.key]).length,
    [accessibleByKey],
  );

  const setOne = (key: string, dial: RecordDial) => {
    onChange({ ...scopes, [key]: dial });
  };

  // Bulk setters only touch ACCESSIBLE (live) rows — greyed rows keep their value.
  const setMany = (types: RecordType[], dial: RecordDial) => {
    const next: RecordVisibilityMap = { ...scopes };
    for (const rt of types) {
      if (accessibleByKey[rt.key]) next[rt.key] = dial;
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
        {accessibleCount > 0 && (
          <SetAllControl label="Set all to" onSet={(d) => setMany(ALL_RECORD_TYPES, d)} />
        )}
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
                      </div>
                      <DialControl
                        value={dialFor(scopes, rt.key)}
                        disabled={!accessible}
                        onSet={(d) => setOne(rt.key, d)}
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
