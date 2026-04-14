export type WorkspaceThemeMode = "light" | "dark";
export type ThemeModePreference = WorkspaceThemeMode | "system";

export interface WorkspaceThemeSeeds {
  primary: string;
  accent: string;
  surfaceTint: string;
  neutralBase: string;
}

export interface WorkspaceThemeSettings {
  version: number;
  seeds: WorkspaceThemeSeeds;
  updatedAt: string | null;
}

export const WORKSPACE_THEME_VERSION = 1;
export const WORKSPACE_THEME_SETTINGS_KEY = "workspace-theme-v1";

export const THEME_STORAGE_KEYS = {
  settings: "workspace-theme-settings-v1",
  resolvedCache: "workspace-theme-cache-v1",
  modePreference: "workspace-theme-mode-v1",
} as const;

export const DEFAULT_WORKSPACE_THEME_SEEDS: WorkspaceThemeSeeds = {
  primary: "#237F66",
  accent: "#B06A4F",
  surfaceTint: "#E8F2EE",
  neutralBase: "#737373",
};

export const SEMANTIC_TOKENS = [
  "bg.page",
  "bg.surface",
  "bg.surfaceSubtle",
  "bg.surfaceTint",
  "text.primary",
  "text.secondary",
  "text.muted",
  "text.inverse",
  "border.default",
  "border.subtle",
  "border.strong",
  "action.primary.bg",
  "action.primary.text",
  "action.primary.border",
  "action.accent.bg",
  "action.accent.text",
  "action.accent.border",
  "state.hover",
  "state.selected",
  "state.focusRing",
  "status.success.bg",
  "status.success.fg",
  "status.success.border",
  "status.warning.bg",
  "status.warning.fg",
  "status.warning.border",
  "status.danger.bg",
  "status.danger.fg",
  "status.danger.border",
] as const;

export type SemanticTokenName = (typeof SEMANTIC_TOKENS)[number];
export type ThemeTokenMap = Record<SemanticTokenName, string>;

export interface ResolvedWorkspaceTheme {
  light: ThemeTokenMap;
  dark: ThemeTokenMap;
}

export interface ResolvedWorkspaceThemeCache {
  version: number;
  seeds: WorkspaceThemeSeeds;
  updatedAt: string | null;
  resolved: ResolvedWorkspaceTheme;
}

export const DARK_MODE_BASE = "#191a1c";

const STATUS_SEEDS = {
  success: "#2B8A6E",
  warning: "#C88A2B",
  danger: "#C94F3D",
} as const;

export const CSS_VARIABLE_BY_TOKEN: Record<SemanticTokenName, string> = {
  "bg.page": "--theme-bg-page",
  "bg.surface": "--theme-bg-surface",
  "bg.surfaceSubtle": "--theme-bg-surface-subtle",
  "bg.surfaceTint": "--theme-bg-surface-tint",
  "text.primary": "--theme-text-primary",
  "text.secondary": "--theme-text-secondary",
  "text.muted": "--theme-text-muted",
  "text.inverse": "--theme-text-inverse",
  "border.default": "--theme-border-default",
  "border.subtle": "--theme-border-subtle",
  "border.strong": "--theme-border-strong",
  "action.primary.bg": "--theme-action-primary-bg",
  "action.primary.text": "--theme-action-primary-text",
  "action.primary.border": "--theme-action-primary-border",
  "action.accent.bg": "--theme-action-accent-bg",
  "action.accent.text": "--theme-action-accent-text",
  "action.accent.border": "--theme-action-accent-border",
  "state.hover": "--theme-state-hover",
  "state.selected": "--theme-state-selected",
  "state.focusRing": "--theme-state-focus-ring",
  "status.success.bg": "--theme-status-success-bg",
  "status.success.fg": "--theme-status-success-fg",
  "status.success.border": "--theme-status-success-border",
  "status.warning.bg": "--theme-status-warning-bg",
  "status.warning.fg": "--theme-status-warning-fg",
  "status.warning.border": "--theme-status-warning-border",
  "status.danger.bg": "--theme-status-danger-bg",
  "status.danger.fg": "--theme-status-danger-fg",
  "status.danger.border": "--theme-status-danger-border",
};

function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value.toUpperCase()}`;
  }

  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const raw = normalized.slice(1);
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function blend(source: string, target: string, amount: number): string {
  const [sr, sg, sb] = hexToRgb(source);
  const [tr, tg, tb] = hexToRgb(target);
  const mix = Math.max(0, Math.min(1, amount));
  return rgbToHex([
    sr + (tr - sr) * mix,
    sg + (tg - sg) * mix,
    sb + (tb - sb) * mix,
  ]);
}

function tint(color: string, amount: number): string {
  return blend(color, "#FFFFFF", amount);
}

function shade(color: string, amount: number): string {
  return blend(color, "#000000", amount);
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = hexToRgb(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function pickTextColor(background: string): string {
  return relativeLuminance(background) > 0.4 ? "#10201B" : "#FFFFFF";
}

export function sanitizeSeeds(input?: Partial<WorkspaceThemeSeeds> | null): WorkspaceThemeSeeds {
  return {
    primary: normalizeHex(input?.primary ?? "") ?? DEFAULT_WORKSPACE_THEME_SEEDS.primary,
    accent: normalizeHex(input?.accent ?? "") ?? DEFAULT_WORKSPACE_THEME_SEEDS.accent,
    surfaceTint: normalizeHex(input?.surfaceTint ?? "") ?? DEFAULT_WORKSPACE_THEME_SEEDS.surfaceTint,
    neutralBase: normalizeHex(input?.neutralBase ?? "") ?? DEFAULT_WORKSPACE_THEME_SEEDS.neutralBase,
  };
}

function createStatusTokens(seed: string, darkMode: boolean): Pick<
  ThemeTokenMap,
  | "status.success.bg"
  | "status.success.fg"
  | "status.success.border"
  | "status.warning.bg"
  | "status.warning.fg"
  | "status.warning.border"
  | "status.danger.bg"
  | "status.danger.fg"
  | "status.danger.border"
> {
  const background = darkMode ? blend("#101614", seed, 0.22) : tint(seed, 0.86);
  const foreground = darkMode ? tint(seed, 0.2) : shade(seed, 0.2);
  const border = darkMode ? blend(seed, "#FFFFFF", 0.18) : tint(seed, 0.48);
  return {
    "status.success.bg": background,
    "status.success.fg": foreground,
    "status.success.border": border,
    "status.warning.bg": background,
    "status.warning.fg": foreground,
    "status.warning.border": border,
    "status.danger.bg": background,
    "status.danger.fg": foreground,
    "status.danger.border": border,
  };
}

function generateLightTokens(seeds: WorkspaceThemeSeeds): ThemeTokenMap {
  const primary = seeds.primary;
  const accent = seeds.accent;
  const neutral = seeds.neutralBase;
  const surfaceTint = seeds.surfaceTint;

  const success = createStatusTokens(STATUS_SEEDS.success, false);
  const warning = createStatusTokens(STATUS_SEEDS.warning, false);
  const danger = createStatusTokens(STATUS_SEEDS.danger, false);

  return {
    "bg.page": blend("#FFFFFF", neutral, 0.06),
    "bg.surface": "#FFFFFF",
    "bg.surfaceSubtle": blend("#FFFFFF", neutral, 0.03),
    "bg.surfaceTint": blend("#FFFFFF", surfaceTint, 0.55),
    "text.primary": blend("#0D1714", neutral, 0.28),
    "text.secondary": blend("#223531", neutral, 0.42),
    "text.muted": blend("#566A64", neutral, 0.58),
    "text.inverse": "#FFFFFF",
    "border.default": blend("#FFFFFF", neutral, 0.16),
    "border.subtle": blend("#FFFFFF", neutral, 0.09),
    "border.strong": blend("#FFFFFF", primary, 0.34),
    "action.primary.bg": primary,
    "action.primary.text": pickTextColor(primary),
    "action.primary.border": shade(primary, 0.12),
    "action.accent.bg": accent,
    "action.accent.text": pickTextColor(accent),
    "action.accent.border": shade(accent, 0.1),
    "state.hover": blend("#FFFFFF", neutral, 0.08),
    "state.selected": blend("#FFFFFF", primary, 0.16),
    "state.focusRing": blend("#FFFFFF", primary, 0.24),
    "status.success.bg": success["status.success.bg"],
    "status.success.fg": success["status.success.fg"],
    "status.success.border": success["status.success.border"],
    "status.warning.bg": warning["status.warning.bg"],
    "status.warning.fg": warning["status.warning.fg"],
    "status.warning.border": warning["status.warning.border"],
    "status.danger.bg": danger["status.danger.bg"],
    "status.danger.fg": danger["status.danger.fg"],
    "status.danger.border": danger["status.danger.border"],
  };
}

function generateDarkTokens(seeds: WorkspaceThemeSeeds): ThemeTokenMap {
  const primary = tint(seeds.primary, 0.02);
  const accent = tint(seeds.accent, 0.02);
  const neutral = seeds.neutralBase;
  const surfaceTint = seeds.surfaceTint;
  const pageBase = DARK_MODE_BASE;
  const surfaceBase = DARK_MODE_BASE;
  const surfaceSubtle = "#25262a";
  const borderDefault = "#2e2f33";
  const borderSubtle = "#272830";
  const hoverState = "#25262a";

  const success = createStatusTokens(STATUS_SEEDS.success, true);
  const warning = createStatusTokens(STATUS_SEEDS.warning, true);
  const danger = createStatusTokens(STATUS_SEEDS.danger, true);

  return {
    "bg.page": pageBase,
    "bg.surface": surfaceBase,
    "bg.surfaceSubtle": surfaceSubtle,
    "bg.surfaceTint": blend(surfaceBase, surfaceTint, 0.05),
    "text.primary": blend("#F0F0F0", neutral, 0.04),
    "text.secondary": blend("#C5C5C5", neutral, 0.08),
    "text.muted": blend("#959595", neutral, 0.1),
    "text.inverse": "#10201B",
    "border.default": borderDefault,
    "border.subtle": borderSubtle,
    "border.strong": "#5FC4A1",
    "action.primary.bg": primary,
    "action.primary.text": pickTextColor(primary),
    "action.primary.border": blend(primary, "#FFFFFF", 0.12),
    "action.accent.bg": accent,
    "action.accent.text": pickTextColor(accent),
    "action.accent.border": blend(accent, "#FFFFFF", 0.12),
    "state.hover": hoverState,
    "state.selected": blend(surfaceBase, "#FFFFFF", 0.12),
    "state.focusRing": "#5FC4A1",
    "status.success.bg": success["status.success.bg"],
    "status.success.fg": success["status.success.fg"],
    "status.success.border": success["status.success.border"],
    "status.warning.bg": warning["status.warning.bg"],
    "status.warning.fg": warning["status.warning.fg"],
    "status.warning.border": warning["status.warning.border"],
    "status.danger.bg": danger["status.danger.bg"],
    "status.danger.fg": danger["status.danger.fg"],
    "status.danger.border": danger["status.danger.border"],
  };
}

export function generateWorkspaceTheme(input?: Partial<WorkspaceThemeSeeds> | null): ResolvedWorkspaceTheme {
  const seeds = sanitizeSeeds(input);
  return {
    light: generateLightTokens(seeds),
    dark: generateDarkTokens(seeds),
  };
}

export function buildCssVariableEntries(tokens: ThemeTokenMap): Array<[string, string]> {
  return SEMANTIC_TOKENS.map((token) => [CSS_VARIABLE_BY_TOKEN[token], tokens[token]]);
}

export function createResolvedThemeCache(
  input?: Partial<WorkspaceThemeSeeds> | null,
  updatedAt: string | null = null,
): ResolvedWorkspaceThemeCache {
  const seeds = sanitizeSeeds(input);
  return {
    version: WORKSPACE_THEME_VERSION,
    seeds,
    updatedAt,
    resolved: generateWorkspaceTheme(seeds),
  };
}

export function isThemeModePreference(value: unknown): value is ThemeModePreference {
  return value === "light" || value === "dark" || value === "system";
}

function isThemeTokenMap(value: unknown): value is ThemeTokenMap {
  if (!value || typeof value !== "object") {
    return false;
  }

  return SEMANTIC_TOKENS.every((token) => normalizeHex((value as Record<string, unknown>)[token] as string) !== null);
}

export function isResolvedWorkspaceThemeCache(value: unknown): value is ResolvedWorkspaceThemeCache {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ResolvedWorkspaceThemeCache>;
  return (
    candidate.version === WORKSPACE_THEME_VERSION &&
    !!candidate.seeds &&
    !!candidate.resolved &&
    isThemeTokenMap(candidate.resolved.light) &&
    isThemeTokenMap(candidate.resolved.dark)
  );
}
