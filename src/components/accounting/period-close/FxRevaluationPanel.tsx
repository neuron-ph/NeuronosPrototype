import { useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { SidePanel } from "../../common/SidePanel";
import { useFxRevaluation } from "../../../hooks/useFxRevaluation";
import { useUser } from "../../../hooks/useUser";
import { formatMoney } from "../../../utils/accountingCurrency";

interface FxRevaluationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onPosted?: () => void;
}

export function FxRevaluationPanel({
  isOpen,
  onClose,
  onPosted,
}: FxRevaluationPanelProps) {
  const { user } = useUser();
  const { loading, summary, error, preview, post } = useFxRevaluation();
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [posting, setPosting] = useState(false);

  const handlePreview = async () => {
    try {
      await preview(asOfDate);
    } catch {
      // surfaced through hook state
    }
  };

  const handlePost = async () => {
    if (!user?.id) {
      toast.error("Login required");
      return;
    }

    setPosting(true);
    try {
      await post(user.id);
      toast.success(`Period-end revaluation posted for ${asOfDate}`);
      onPosted?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to post revaluation");
    } finally {
      setPosting(false);
    }
  };

  const significantLines = summary?.lines.filter((line) => Math.abs(line.delta) >= 0.005) ?? [];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Period-End FX Revaluation"
      widthClass="w-[640px]"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--theme-border-default)] px-6 py-5">
          <p className="mb-3 text-[12px] leading-relaxed text-[var(--theme-text-muted)]">
            Marks open USD receivables and advance balances to the period-end
            spot rate. Posts unrealized gain/loss to accounts 4530/7030 with an
            auto-reversing entry on day 1 of the next period.
          </p>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)]">
                As-of Date (period end)
              </label>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--theme-border-default)] px-3 text-[13px]"
              />
            </div>

            <button
              onClick={handlePreview}
              disabled={loading}
              className="flex h-10 items-center gap-2 rounded-lg bg-[var(--theme-action-primary-bg)] px-4 text-[13px] font-medium text-[var(--theme-action-primary-text)] disabled:opacity-60"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              <RefreshCw size={14} />
              Preview
            </button>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--theme-status-warning-border)] bg-[var(--theme-status-warning-bg)] p-3">
              <AlertTriangle
                size={14}
                className="mt-0.5 text-[var(--theme-status-warning-fg)]"
              />
              <span className="text-[12px] text-[var(--theme-status-warning-fg)]">
                {error}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!summary && !loading && (
            <p className="text-[13px] text-[var(--theme-text-muted)]">
              Pick a period-end date and click Preview.
            </p>
          )}

          {summary && significantLines.length === 0 && (
            <p className="text-[13px] text-[var(--theme-text-muted)]">
              No open foreign positions need revaluation as of {summary.asOfDate}.
            </p>
          )}

          {significantLines.length > 0 && (
            <div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--theme-border-default)] text-[10px] uppercase text-[var(--theme-text-muted)]">
                    <th className="py-2 text-left">Position</th>
                    <th className="py-2 text-right">USD</th>
                    <th className="py-2 text-right">Old Rate</th>
                    <th className="py-2 text-right">New Rate</th>
                    <th className="py-2 text-right">Delta PHP</th>
                  </tr>
                </thead>
                <tbody>
                  {significantLines.map((line) => (
                    <tr
                      key={line.position.recordId}
                      className="border-b border-[var(--theme-border-subtle)]"
                    >
                      <td className="py-2">
                        <div className="font-medium text-[var(--theme-text-primary)]">
                          {line.position.recordType === "invoice" ? "AR" : "Advance"} ·{" "}
                          {line.position.recordId.slice(-6)}
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono">
                        ${line.position.originalAmount.toLocaleString()}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {line.position.carryingRate}
                      </td>
                      <td className="py-2 text-right font-mono">{line.newRate}</td>
                      <td
                        className={`py-2 text-right font-mono font-semibold ${
                          line.delta > 0 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {line.delta > 0 ? "+" : ""}
                        {formatMoney(line.delta, "PHP")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      colSpan={4}
                      className="py-3 text-right font-medium text-[var(--theme-text-muted)]"
                    >
                      Net Delta
                    </td>
                    <td
                      className={`py-3 text-right font-mono font-bold ${
                        summary.totalDelta > 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {summary.totalDelta > 0 ? "+" : ""}
                      {formatMoney(summary.totalDelta, "PHP")}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <p className="mt-4 text-[11px] text-[var(--theme-text-muted)]">
                Reversal will post automatically on {summary.reversalDate}.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--theme-border-default)] px-6 py-4">
          <button
            onClick={onClose}
            className="h-10 px-4 text-[13px] text-[var(--theme-text-muted)]"
          >
            Cancel
          </button>
          <button
            onClick={handlePost}
            disabled={posting || !summary || significantLines.length === 0}
            className="flex h-10 items-center gap-2 rounded-lg bg-[var(--theme-action-primary-bg)] px-5 text-[13px] font-semibold text-[var(--theme-action-primary-text)] disabled:opacity-60"
          >
            {posting && <Loader2 size={14} className="animate-spin" />}
            Post Revaluation
          </button>
        </div>
      </div>
    </SidePanel>
  );
}
