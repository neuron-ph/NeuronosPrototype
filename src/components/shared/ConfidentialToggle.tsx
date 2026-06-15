import { useEffect, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { toast } from "sonner@2.0.3";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";

// Record Visibility V2 (docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md, Phase 5).
// Exec-only control to flip a record's `confidential` flag, with a confirmation
// step in both directions. When on, the record is visible ONLY to people directly
// on it (creator / assignee / linked work) and executives — RLS enforces this and
// the change is logged to record_confidentiality_audit.
//
// Renders nothing for non-executives (mirrors the DB is_executive() = department
// 'Executive' gate). Reusable across all in-scope record types.

interface ConfidentialToggleProps {
  /** DB table the record lives in. Quotations & contracts both use 'quotations'. */
  table: "contacts" | "customers" | "quotations" | "projects" | "bookings";
  recordId: string;
  confidential: boolean;
  onChanged?: (next: boolean) => void;
  /** Render as a full-width block button (sibling to a Delete button in a detail card). */
  fullWidth?: boolean;
}

export function ConfidentialToggle({ table, recordId, confidential, onChanged, fullWidth }: ConfidentialToggleProps) {
  const { effectiveDepartment } = useUser();
  const isExec = effectiveDepartment === "Executive";
  const [value, setValue] = useState(confidential);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  // Self-fetch the authoritative current value on mount (exec-only). Many feeder
  // queries select explicit column lists that omit `confidential`, so the passed
  // prop can be stale — this one cheap read keeps the control truthful everywhere.
  useEffect(() => {
    if (!isExec || !recordId) return;
    let active = true;
    void supabase
      .from(table)
      .select("confidential")
      .eq("id", recordId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data && typeof (data as { confidential?: boolean }).confidential === "boolean") {
          setValue((data as { confidential: boolean }).confidential);
        }
      });
    return () => { active = false; };
  }, [isExec, table, recordId]);

  // Only executives can see or change confidentiality (mirrors is_executive()).
  if (!isExec) return null;

  const apply = async () => {
    if (saving) return;
    const next = !value;
    setSaving(true);
    const { error } = await supabase.from(table).update({ confidential: next }).eq("id", recordId);
    setSaving(false);
    setOpen(false);
    if (error) {
      toast.error(`Couldn't update confidentiality: ${error.message}`);
      return;
    }
    setValue(next);
    onChanged?.(next);
    toast.success(
      next
        ? "Marked confidential — visible only to people directly on it + executives"
        : "Confidentiality removed — back to normal visibility",
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {fullWidth ? (
          // Same markup as the sibling Delete button — only color (warning vs
          // danger) and icon differ, so they read as a matched pair.
          <button
            type="button"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px]"
            style={{
              border: "1px solid var(--theme-border-default)",
              backgroundColor: "var(--theme-bg-surface)",
              color: "var(--theme-text-secondary)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.65 : 1,
            }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; }}
          >
            {value ? <Lock size={14} /> : <LockOpen size={14} />}
            {value ? "Confidential" : "Mark confidential"}
          </button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={value ? "border-[var(--theme-border-default)] bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-state-hover)] hover:text-[var(--theme-text-primary)]" : undefined}
          >
            {value ? <Lock /> : <LockOpen />}
            {value ? "Confidential" : "Mark confidential"}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {value ? "Remove confidentiality?" : "Mark this record as confidential?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {value
              ? "This record will return to normal visibility — anyone with access to this module across departments will be able to see it again."
              : "Only people directly on this record (creator and assignees) and executives will be able to see it. Everyone else will lose access immediately."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void apply(); }}
            disabled={saving}
          >
            {saving ? "Saving…" : value ? "Remove confidentiality" : "Mark confidential"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
