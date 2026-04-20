import { useState, useRef, useEffect } from "react";
import { X, Building2 } from "lucide-react";
import { TICKET_AVATAR_TONES } from "./ticketingTheme";

// ── Shared types ─────────────────────────────────────────────────────────────

export interface RecipientChip {
  id: string;
  label: string;
  type: "user" | "department";
  userId?: string;
  department?: string;
}

export interface UserOption {
  id: string;
  name: string;
  department: string;
}

export const DEPARTMENTS = [
  "Business Development", "Pricing", "Operations",
  "Accounting", "HR", "Executive",
];

export function avatarColor(name: string) {
  return TICKET_AVATAR_TONES[name.charCodeAt(0) % TICKET_AVATAR_TONES.length];
}

export function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// ── Options builder ──────────────────────────────────────────────────────────

export function buildOptions(
  allUsers: UserOption[],
  query: string,
  excludeIds: string[]
): { people: RecipientChip[]; depts: RecipientChip[] } {
  const q = query.trim().toLowerCase();
  const people = allUsers
    .filter(
      (u) =>
        !excludeIds.includes(u.id) &&
        (!q || u.name.toLowerCase().includes(q) || (u.department || "").toLowerCase().includes(q))
    )
    .slice(0, 8)
    .map((u) => ({ id: u.id, label: u.name, type: "user" as const, userId: u.id, department: u.department }));

  const depts = DEPARTMENTS
    .filter((d) => !excludeIds.includes(`dept-${d}`) && (!q || d.toLowerCase().includes(q)))
    .map((d) => ({ id: `dept-${d}`, label: d, type: "department" as const, department: d }));

  return { people, depts };
}

// ── Component ────────────────────────────────────────────────────────────────

interface RecipientFieldProps {
  label: string;
  chips: RecipientChip[];
  allUsers: UserOption[];
  excludeIds: string[];
  onAdd: (chip: RecipientChip) => void;
  onRemove: (id: string) => void;
  action?: React.ReactNode;
  /** If true, chips are read-only (no remove button, no input) */
  readOnly?: boolean;
}

export function RecipientField({
  label,
  chips,
  allUsers,
  excludeIds,
  onAdd,
  onRemove,
  action,
  readOnly = false,
}: RecipientFieldProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { people, depts } = buildOptions(allUsers, query, excludeIds);
  const flatOptions = [...people, ...depts];

  const select = (chip: RecipientChip) => {
    onAdd(chip);
    setQuery("");
    setHighlightedIdx(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatOptions[highlightedIdx]) select(flatOptions[highlightedIdx]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "Backspace" && query === "" && chips.length > 0) {
      onRemove(chips[chips.length - 1].id);
    }
  };

  useEffect(() => {
    const el = dropdownRef.current?.querySelector(`[data-idx="${highlightedIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  useEffect(() => { setHighlightedIdx(0); }, [query, excludeIds.length]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUpward(spaceBelow < 280 && spaceAbove > spaceBelow);
  }, [isOpen]);

  const showDropdown = !readOnly && isOpen && (people.length > 0 || depts.length > 0);

  return (
    <div
      ref={containerRef}
      style={{
        padding: "8px 0",
        borderBottom: `1px solid ${isOpen && !readOnly ? "var(--theme-status-success-border)" : "var(--theme-border-subtle)"}`,
        position: "relative",
        transition: "border-color 150ms ease",
      }}
    >
      <div className="flex items-start gap-2 flex-wrap">
        {/* Label */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--theme-text-muted)",
            marginTop: 5,
            width: 28,
            flexShrink: 0,
            letterSpacing: "0.3px",
          }}
        >
          {label}
        </span>

        {/* Chips + input */}
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {chips.map((chip) => {
            const col =
              chip.type === "user"
                ? avatarColor(chip.label)
                : { bg: "var(--neuron-semantic-info-bg)", text: "var(--neuron-semantic-info)", border: "var(--neuron-semantic-info-border)" };
            return (
              <span
                key={chip.id}
                className="flex items-center gap-1"
                style={{
                  padding: "2px 8px 2px 4px",
                  borderRadius: 20,
                  border: `1px solid ${col.border}`,
                  backgroundColor: col.bg,
                  fontSize: 12,
                  color: col.text,
                  fontWeight: 500,
                  lineHeight: 1.6,
                }}
              >
                {chip.type === "user" ? (
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: col.text,
                      fontSize: 8,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      border: `1px solid ${col.border}`,
                    }}
                  >
                    {initials(chip.label)}
                  </span>
                ) : (
                  <Building2 size={10} style={{ color: col.text, flexShrink: 0 }} />
                )}
                {chip.type === "department" ? `${chip.department} dept` : chip.label}
                {!readOnly && (
                  <button
                    onClick={() => onRemove(chip.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--theme-text-muted)",
                      padding: "0 0 0 2px",
                      display: "flex",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-accent-terracotta)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            );
          })}

          {!readOnly && (
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setTimeout(() => setIsOpen(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder={chips.length === 0 ? "Search people or departments…" : ""}
              style={{
                border: "none",
                outline: "none",
                fontSize: 12,
                color: "var(--theme-text-primary)",
                minWidth: 120,
                flex: 1,
                backgroundColor: "transparent",
              }}
            />
          )}

          {action}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            ...(openUpward
              ? { bottom: "calc(100% + 4px)" }
              : { top: "calc(100% + 4px)" }),
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: 10,
            boxShadow: openUpward
              ? "0 -4px 24px rgba(0,0,0,0.10)"
              : "0 4px 24px rgba(0,0,0,0.10)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {people.length > 0 && (
            <>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--theme-text-muted)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                People
              </div>
              {people.map((r, i) => {
                const col = avatarColor(r.label);
                const isHighlighted = flatOptions[highlightedIdx]?.id === r.id;
                return (
                  <button
                    key={r.id}
                    data-idx={i}
                    onMouseDown={() => select(r)}
                    onMouseEnter={() => setHighlightedIdx(i)}
                    className="w-full flex items-center gap-3 text-left"
                    style={{
                      padding: "8px 12px",
                      border: "none",
                      backgroundColor: isHighlighted ? "var(--theme-bg-page)" : "transparent",
                      cursor: "pointer",
                      transition: "background-color 80ms ease",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        backgroundColor: col.bg,
                        color: col.text,
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {initials(r.label)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)", margin: 0 }}>{r.label}</p>
                      {r.department && (
                        <p style={{ fontSize: 11, color: "var(--theme-text-muted)", margin: 0 }}>{r.department}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {depts.length > 0 && (
            <>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--theme-text-muted)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  borderTop: people.length > 0 ? "1px solid var(--theme-border-subtle)" : "none",
                }}
              >
                Departments
              </div>
              {depts.map((r, i) => {
                const flatIdx = people.length + i;
                const isHighlighted = flatOptions[highlightedIdx]?.id === r.id;
                return (
                  <button
                    key={r.id}
                    data-idx={flatIdx}
                    onMouseDown={() => select(r)}
                    onMouseEnter={() => setHighlightedIdx(flatIdx)}
                    className="w-full flex items-center gap-3 text-left"
                    style={{
                      padding: "8px 12px",
                      border: "none",
                      backgroundColor: isHighlighted ? "var(--theme-bg-page)" : "transparent",
                      cursor: "pointer",
                      transition: "background-color 80ms ease",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: "var(--theme-bg-surface-tint)",
                        border: "1px solid var(--theme-status-success-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Building2 size={13} style={{ color: "var(--theme-action-primary-bg)" }} />
                    </span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)", margin: 0 }}>{r.label}</p>
                      <p style={{ fontSize: 11, color: "var(--theme-text-muted)", margin: 0 }}>All managers</p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
