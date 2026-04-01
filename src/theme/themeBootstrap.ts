import {
  CSS_VARIABLE_BY_TOKEN,
  ResolvedWorkspaceThemeCache,
  THEME_STORAGE_KEYS,
  ThemeModePreference,
  WorkspaceThemeMode,
  buildCssVariableEntries,
  isResolvedWorkspaceThemeCache,
  isThemeModePreference,
} from "./workspaceTheme";

function getRoot(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement;
}

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return globalThis.localStorage as Storage;
  }

  return null;
}

export function resolveThemeMode(preference: ThemeModePreference): WorkspaceThemeMode {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

export function applyResolvedTheme(cache: ResolvedWorkspaceThemeCache, mode: WorkspaceThemeMode): void {
  const root = getRoot();
  if (!root) {
    return;
  }

  const resolvedMode = cache.resolved[mode];
  for (const [variableName, value] of buildCssVariableEntries(resolvedMode)) {
    root.style.setProperty(variableName, value);
  }

  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function readCachedTheme(storageKey: string = THEME_STORAGE_KEYS.resolvedCache): ResolvedWorkspaceThemeCache | null {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isResolvedWorkspaceThemeCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readThemeModePreference(storageKey: string = THEME_STORAGE_KEYS.modePreference): ThemeModePreference {
  const storage = getLocalStorage();
  if (!storage) {
    return "light";
  }

  try {
    const raw = storage.getItem(storageKey);
    return isThemeModePreference(raw) ? raw : "light";
  } catch {
    return "light";
  }
}

export function bootstrapTheme(options?: {
  cacheKey?: string;
  modeKey?: string;
}): WorkspaceThemeMode {
  const cacheKey = options?.cacheKey ?? THEME_STORAGE_KEYS.resolvedCache;
  const modeKey = options?.modeKey ?? THEME_STORAGE_KEYS.modePreference;
  const mode = resolveThemeMode(readThemeModePreference(modeKey));
  const cache = readCachedTheme(cacheKey);
  const root = getRoot();

  if (root) {
    if (mode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }

  if (cache) {
    applyResolvedTheme(cache, mode);
  }

  return mode;
}

export const THEME_BOOTSTRAP_VARIABLES = CSS_VARIABLE_BY_TOKEN;
