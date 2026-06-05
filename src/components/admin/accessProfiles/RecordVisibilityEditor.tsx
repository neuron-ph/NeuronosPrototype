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

const DIAL_ACTIVE_COLOR: Record<RecordDial, string> = {
  own: "var(--neuron-action-primary)",
  team: "var(--neuron-action-primary)",
  everything: "var(--neuron-action-primary)",
};

function DialControl({
  value,
  disabled,
  onSet,
}: {
  value: RecordDial;
  disabled: boolean;
  onSet: (dial: RecordDial) => void;
}) {
  return (
    <div
      role="radiogroup"
      style={{
        display: "inline-flex",
        borderRadius: 8,
        border: "1px solid var(--neuron-ui-border)",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {RECORD_DIALS.map((d, i) => {
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
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              border: "none",
              borderLeft: i === 0 ? "none" : "1px solid var(--neuron-ui-border)",
              background: active ? DIAL_ACTIVE_COLOR[d.value] : "var(--neuron-bg-elevated)",
              color: active ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-muted)",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

function SetAllControl({
  label,
  onSet,
}: {
  label: string;
  onSet: (dial: RecordDial) => void;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>{label}</span>
      {RECORD_DIALS.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => onSet(d.value)}
          style={{
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 500,
            borderRadius: 6,
            border: "1px solid var(--neuron-ui-border)",
            background: "transparent",
            color: "var(--neuron-ink-muted)",
            cursor: "pointer",
          }}
        >
          {d.label}
        </button>
      ))}
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
                            grant in Feature Access to enable
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
