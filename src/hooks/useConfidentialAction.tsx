import { useEffect, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { useUser } from "./useUser";
import { supabase } from "../utils/supabase/client";
import { toast } from "../components/ui/toast-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

type ConfidentialTable = "contacts" | "customers" | "quotations" | "projects" | "bookings";

interface UseConfidentialActionOptions {
  table: ConfidentialTable;
  recordId: string;
  confidential: boolean;
  onChanged?: (next: boolean) => void;
}

export function useConfidentialAction({ table, recordId, confidential, onChanged }: UseConfidentialActionOptions) {
  const { effectiveDepartment } = useUser();
  const isExecutive = effectiveDepartment === "Executive";
  const [value, setValue] = useState(confidential);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(confidential);
  }, [confidential]);

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
        ? "Marked confidential - visible only to people directly on it + executives"
        : "Confidentiality removed - back to normal visibility",
    );
  };

  const Icon = value ? LockOpen : Lock;
  const label = value ? "Remove confidentiality" : "Mark confidential";
  const dialog = isExecutive ? (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {value ? "Remove confidentiality?" : "Mark this record as confidential?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {value
              ? "This record will return to normal visibility - anyone with access to this module across departments will be able to see it again."
              : "Only people directly on this record (creator and assignees) and executives will be able to see it. Everyone else will lose access immediately."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void apply();
            }}
            disabled={saving}
          >
            {saving ? "Saving..." : value ? "Remove confidentiality" : "Mark confidential"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return {
    isExecutive,
    label,
    Icon,
    openDialog: () => setOpen(true),
    dialog,
  };
}
