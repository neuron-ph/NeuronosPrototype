export interface TicketTone {
  bg: string;
  text: string;
  border: string;
}

export const TICKET_TYPE_TONES: Record<string, TicketTone> = {
  fyi:      { bg: "var(--neuron-pill-inactive-bg)",    text: "var(--neuron-pill-inactive-text)",   border: "var(--neuron-pill-inactive-border)" },
  request:  { bg: "var(--theme-status-success-bg)",    text: "var(--theme-status-success-fg)",     border: "var(--theme-status-success-border)" },
  approval: { bg: "var(--theme-status-warning-bg)",    text: "var(--theme-status-warning-fg)",     border: "var(--theme-status-warning-border)" },
};

export const TICKET_PRIORITY_TONES: Record<string, TicketTone> = {
  normal: { bg: "var(--neuron-pill-inactive-bg)", text: "var(--neuron-pill-inactive-text)", border: "var(--neuron-pill-inactive-border)" },
  urgent: { bg: "var(--theme-status-danger-bg)",  text: "var(--theme-status-danger-fg)",   border: "var(--theme-status-danger-border)" },
};

export const TICKET_STATUS_TONES: Record<string, TicketTone> = {
  draft:        { bg: "var(--neuron-pill-inactive-bg)",  text: "var(--neuron-pill-inactive-text)", border: "var(--neuron-pill-inactive-border)" },
  open:         { bg: "var(--neuron-semantic-info-bg)",  text: "var(--neuron-semantic-info)",      border: "var(--neuron-semantic-info-border)" },
  acknowledged: { bg: "var(--theme-status-success-bg)",  text: "var(--theme-status-success-fg)",   border: "var(--theme-status-success-border)" },
  in_progress:  { bg: "var(--theme-status-warning-bg)",  text: "var(--theme-status-warning-fg)",   border: "var(--theme-status-warning-border)" },
  done:         { bg: "var(--theme-status-success-bg)",  text: "var(--theme-status-success-fg)",   border: "var(--theme-status-success-border)" },
  returned:     { bg: "var(--theme-status-danger-bg)",   text: "var(--theme-status-danger-fg)",    border: "var(--theme-status-danger-border)" },
  archived:     { bg: "var(--neuron-pill-inactive-bg)",  text: "var(--neuron-pill-inactive-text)", border: "var(--neuron-pill-inactive-border)" },
};

export const TICKET_ENTITY_TONES: Record<string, TicketTone> = {
  quotation:      { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-text-secondary)", border: "var(--theme-border-default)" },
  contract:       { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-text-secondary)", border: "var(--theme-border-default)" },
  booking:        { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-text-secondary)", border: "var(--theme-border-default)" },
  project:        { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-text-secondary)", border: "var(--theme-border-default)" },
  customer:       { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-text-secondary)", border: "var(--theme-border-default)" },
  contact:        { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-text-secondary)", border: "var(--theme-border-default)" },
  budget_request: { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-text-secondary)", border: "var(--theme-border-default)" },
  invoice:        { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)" },
  collection:     { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)" },
  expense:        { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)" },
};

export const TICKET_AVATAR_TONES = [
  { bg: "var(--neuron-dept-bd-bg)",          text: "var(--neuron-dept-bd-text)",      border: "var(--theme-status-success-border)" },
  { bg: "var(--neuron-pill-inactive-bg)",    text: "var(--neuron-pill-inactive-text)", border: "var(--neuron-pill-inactive-border)" },
  { bg: "var(--neuron-dept-ops-bg)",         text: "var(--neuron-dept-ops-text)",     border: "var(--theme-status-warning-border)" },
];

export function ticketBadgeStyle(tone: TicketTone, fontWeight = 600) {
  return {
    fontSize: 11,
    fontWeight,
    padding: "3px 8px",
    borderRadius: 6,
    border: `1px solid ${tone.border}`,
    backgroundColor: tone.bg,
    color: tone.text,
  };
}

export function ticketToggleStyle(selected: boolean, tone: TicketTone) {
  if (selected) {
    return {
      ...ticketBadgeStyle(tone),
      fontSize: 12,
      fontWeight: 600,
      padding: "4px 12px",
      cursor: "pointer",
      transition: "color 150ms ease, border-color 150ms ease, background-color 150ms ease",
    };
  }

  return {
    fontSize: 12,
    fontWeight: 500,
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid var(--neuron-ui-border)",
    backgroundColor: "var(--theme-bg-surface)",
    color: "var(--neuron-ink-secondary)",
    cursor: "pointer",
    transition: "color 150ms ease, border-color 150ms ease, background-color 150ms ease",
  };
}
