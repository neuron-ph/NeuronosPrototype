import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../utils/supabase/client";

/**
 * Org-wide auto-uppercase for user-entered text. Default ON.
 *
 * Scope: every <input> across the app, except types where uppercasing breaks
 * meaning (email, password, url, number, date, etc.) or fields/regions that
 * opt out via `data-no-caps`. Textareas are treated as prose and left alone,
 * so comments, remarks, notes, and descriptions are unaffected.
 *
 * Implementation: a single document-level listener intercepts the native
 * `input` event, rewrites the value to uppercase using the React-compatible
 * native setter, and redispatches so React's controlled-input onChange fires
 * with the uppercased value. No per-component wiring required.
 */

interface AutoCapsContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => Promise<void>;
}

const AutoCapsContext = createContext<AutoCapsContextValue>({
  enabled: true,
  setEnabled: async () => {},
});

const SKIP_INPUT_TYPES = new Set([
  "email", "password", "url", "number", "tel",
  "date", "datetime-local", "time", "month", "week",
  "search", "color", "range", "checkbox", "radio", "file", "hidden",
]);

function shouldTransform(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled) return false;
  const type = (el.type || "text").toLowerCase();
  if (SKIP_INPUT_TYPES.has(type)) return false;
  if (el.getAttribute("data-no-caps") === "true") return false;
  if (el.closest('[data-no-caps="true"]')) return false;
  // Skip authentication forms (login/signup) — autocomplete attribute is a reliable signal.
  const autocomplete = (el.autocomplete || "").toLowerCase();
  if (autocomplete.includes("password") || autocomplete.includes("email") || autocomplete === "username") {
    return false;
  }
  return true;
}

export function AutoCapsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("org_settings")
        .select("auto_caps_enabled")
        .eq("id", "default")
        .maybeSingle();
      if (cancelled) return;
      if (data && typeof data.auto_caps_enabled === "boolean") {
        setEnabledState(data.auto_caps_enabled);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: Event) => {
      const el = event.target;
      if (!shouldTransform(el)) return;
      const upper = el.value.toUpperCase();
      if (upper === el.value) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!setter) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      setter.call(el, upper);
      try {
        if (start !== null && end !== null) el.setSelectionRange(start, end);
      } catch {
        /* selection not supported on this input type */
      }
      // Redispatch so React's controlled-input onChange picks up the new value.
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    document.addEventListener("input", handler, true);
    return () => document.removeEventListener("input", handler, true);
  }, [enabled]);

  const setEnabled = async (v: boolean) => {
    setEnabledState(v);
    const { error } = await supabase
      .from("org_settings")
      .update({ auto_caps_enabled: v, updated_at: new Date().toISOString() })
      .eq("id", "default");
    if (error) {
      // Revert local state on failure so UI reflects truth.
      setEnabledState(!v);
      throw error;
    }
  };

  return (
    <AutoCapsContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </AutoCapsContext.Provider>
  );
}

export function useAutoCaps() {
  return useContext(AutoCapsContext);
}
