import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";
import { projectId, publicAnonKey } from "../utils/supabase/info";

interface HealthCheck {
  status: "loading" | "connected" | "error";
  message: string;
  details?: Record<string, any>;
}

export function SupabaseDebug() {
  const [health, setHealth] = useState<HealthCheck>({ status: "loading", message: "Checking connection..." });
  const [authUser, setAuthUser] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tableCheck, setTableCheck] = useState<{ table: string; count: number | null; error: string | null }[]>([]);
  const [isCheckingTables, setIsCheckingTables] = useState(false);

  const supabaseUrl = `https://${projectId}.supabase.co`;
  const maskedKey = publicAnonKey
    ? `${publicAnonKey.substring(0, 20)}...${publicAnonKey.substring(publicAnonKey.length - 10)}`
    : "NOT SET";

  // Decode JWT to show ref
  const decodeJwtRef = (key: string): string => {
    try {
      const payload = JSON.parse(atob(key.split(".")[1]));
      return payload.ref || "unknown";
    } catch {
      return "unable to decode";
    }
  };

  const jwtRef = publicAnonKey ? decodeJwtRef(publicAnonKey) : "N/A";

  useEffect(() => {
    checkConnection();
    checkAuthUser();
  }, []);

  const checkConnection = async () => {
    setHealth({ status: "loading", message: "Pinging Supabase..." });
    try {
      const start = Date.now();
      // Simple query to check connectivity
      const { data, error } = await supabase.from("users").select("id", { count: "exact", head: true });
      const latency = Date.now() - start;

      if (error) {
        // Even a permission error means we're connected
        if (error.code === "42501" || error.message.includes("permission")) {
          setHealth({
            status: "connected",
            message: `Connected (${latency}ms) — RLS active, permission denied on users table (expected if not authenticated)`,
            details: { latency, rlsActive: true },
          });
        } else {
          setHealth({
            status: "error",
            message: `Query error: ${error.message}`,
            details: { code: error.code, hint: error.hint },
          });
        }
      } else {
        setHealth({
          status: "connected",
          message: `Connected (${latency}ms)`,
          details: { latency },
        });
      }
    } catch (err: any) {
      setHealth({
        status: "error",
        message: `Network error: ${err.message}`,
      });
    }
  };

  const checkAuthUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthUser(user);
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const checkTables = async () => {
    setIsCheckingTables(true);
    const tables = [
      "users", "customers", "contacts", "inquiries", "quotations",
      "projects", "contracts", "bookings", "invoices", "billing_line_items",
      "collections", "evouchers", "expenses",
      "counters", "tickets", "ticket_types",
      "activities", "tasks", "vendors", "budget_requests",
    ];

    const results: typeof tableCheck = [];

    for (const table of tables) {
      try {
        const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
        results.push({
          table,
          count: error ? null : (count ?? 0),
          error: error ? `${error.code}: ${error.message}` : null,
        });
      } catch (err: any) {
        results.push({ table, count: null, error: err.message });
      }
    }

    setTableCheck(results);
    setIsCheckingTables(false);
  };

  const statusColors: Record<string, string> = {
    loading: "#EAB308",
    connected: "#22C55E",
    error: "#EF4444",
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--neuron-bg-page, #f5f6fa)" }}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: statusColors[health.status] }}
          />
          <h1 style={{ color: "var(--neuron-ink-primary, #0a1d4d)" }}>
            Supabase Connection Debug
          </h1>
        </div>

        {/* Connection Info Card */}
        <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--theme-bg-surface)", borderColor: "var(--neuron-border, #e5e7eb)" }}>
          <h2 className="text-sm" style={{ color: "var(--neuron-ink-muted, #667085)" }}>
            CONNECTION DETAILS
          </h2>

          <div className="space-y-3 font-mono text-sm">
            <Row label="Project ID" value={projectId} />
            <Row label="JWT Ref (from key)" value={jwtRef} highlight={jwtRef !== projectId} />
            <Row label="URL" value={supabaseUrl} />
            <Row label="Anon Key" value={maskedKey} />
            <Row label="Status" value={health.message} />
            {jwtRef !== projectId && (
              <div className="p-3 rounded-lg bg-[var(--theme-status-danger-bg)] border border-[var(--theme-status-danger-border)] text-red-700 text-xs">
                <strong>MISMATCH:</strong> The anon key's embedded ref (<code>{jwtRef}</code>) does not match
                the configured project ID (<code>{projectId}</code>). The key belongs to a different project!
              </div>
            )}
          </div>
        </div>

        {/* Auth State Card */}
        <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--theme-bg-surface)", borderColor: "var(--neuron-border, #e5e7eb)" }}>
          <h2 className="text-sm" style={{ color: "var(--neuron-ink-muted, #667085)" }}>
            AUTH STATE
          </h2>

          {authError ? (
            <p className="text-sm text-[var(--theme-status-danger-fg)] font-mono">{authError}</p>
          ) : authUser ? (
            <div className="space-y-2 font-mono text-sm">
              <Row label="Auth UID" value={authUser.id} />
              <Row label="Email" value={authUser.email || "N/A"} />
              <Row label="Confirmed" value={authUser.email_confirmed_at ? "Yes" : "No"} />
              <Row label="Created" value={authUser.created_at || "N/A"} />
              <Row label="Role" value={authUser.role || "N/A"} />
            </div>
          ) : (
            <p className="text-sm font-mono" style={{ color: "var(--neuron-ink-muted)" }}>
              Not authenticated (no active session)
            </p>
          )}
        </div>

        {/* Table Check Card */}
        <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--theme-bg-surface)", borderColor: "var(--neuron-border, #e5e7eb)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm" style={{ color: "var(--neuron-ink-muted, #667085)" }}>
              TABLE CONNECTIVITY ({tableCheck.length > 0 ? `${tableCheck.filter(t => t.error === null).length}/${tableCheck.length} accessible` : "not checked"})
            </h2>
            <button
              onClick={checkTables}
              disabled={isCheckingTables}
              className="px-3 py-1.5 rounded-lg text-xs text-white disabled:opacity-50"
              style={{ background: "var(--neuron-brand-green, #2f7f6f)" }}
            >
              {isCheckingTables ? "Checking..." : "Check Tables"}
            </button>
          </div>

          {tableCheck.length > 0 && (
            <div className="space-y-1 font-mono text-xs max-h-80 overflow-auto">
              {tableCheck.map((t) => (
                <div
                  key={t.table}
                  className="flex items-center justify-between py-1 px-2 rounded"
                  style={{ background: t.error ? "#FEF2F2" : "#F0FDF4" }}
                >
                  <span style={{ color: "var(--neuron-ink-primary)" }}>{t.table}</span>
                  {t.error ? (
                    <span className="text-[var(--theme-status-danger-fg)] truncate max-w-[60%] text-right">{t.error}</span>
                  ) : (
                    <span className="text-[var(--theme-status-success-fg)]">{t.count} rows</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { checkConnection(); checkAuthUser(); }}
            className="px-4 py-2 rounded-lg text-sm text-white"
            style={{ background: "var(--neuron-brand-green, #2f7f6f)" }}
          >
            Re-check Connection
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-4">
      <span className="w-40 shrink-0" style={{ color: "var(--neuron-ink-muted, #667085)" }}>
        {label}
      </span>
      <span
        className="break-all"
        style={{ color: highlight ? "#EF4444" : "var(--neuron-ink-primary, #0a1d4d)" }}
      >
        {value}
      </span>
    </div>
  );
}
