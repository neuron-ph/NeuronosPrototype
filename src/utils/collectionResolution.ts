import { supabase } from "./supabase/client";

export const CREDITED_COLLECTION_STATUS = "credited";
export const REFUNDED_COLLECTION_STATUS = "refunded";

export const NON_APPLIED_COLLECTION_STATUSES = new Set([
  "draft",
  "cancelled",
  "voided",
  "void",
  CREDITED_COLLECTION_STATUS,
  REFUNDED_COLLECTION_STATUS,
]);

export const isCollectionAppliedToInvoice = (collection: any): boolean => {
  const status = String(collection?.status || "").toLowerCase();
  return !NON_APPLIED_COLLECTION_STATUSES.has(status);
};

export const isCollectionResolvedByCreditOrRefund = (collection: any): boolean => {
  const status = String(collection?.status || "").toLowerCase();
  return status === CREDITED_COLLECTION_STATUS || status === REFUNDED_COLLECTION_STATUS;
};

export const getCollectionResolutionLabel = (collection: any): string | null => {
  const status = String(collection?.status || "").toLowerCase();
  if (status === CREDITED_COLLECTION_STATUS) return "Customer Credit";
  if (status === REFUNDED_COLLECTION_STATUS) return "Refunded";
  return null;
};

const appendResolutionNote = (existingNotes: string | null | undefined, resolution: "credited" | "refunded") => {
  const timestamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const resolutionLabel = resolution === CREDITED_COLLECTION_STATUS ? "Customer credit recorded" : "Refund recorded";

  return [existingNotes?.trim(), `[${timestamp}] ${resolutionLabel}.`]
    .filter(Boolean)
    .join("\n\n");
};

export async function resolveCollectionDisposition({
  collection,
  sourceTable,
  resolution,
}: {
  collection: any;
  sourceTable: "collections" | "evouchers";
  resolution: "credited" | "refunded";
}): Promise<any> {
  const nextNotes = appendResolutionNote(collection?.notes, resolution);
  const nextStatus = resolution;
  const nextUpdatedAt = new Date().toISOString();

  if (sourceTable === "collections") {
    const { data, error } = await supabase
      .from("collections")
      .update({
        status: nextStatus,
        notes: nextNotes,
        updated_at: nextUpdatedAt,
      })
      .eq("id", collection.id)
      .select()
      .single();

    if (error) throw error;

    const evoucherId = data?.evoucher_id || collection?.evoucher_id;
    if (evoucherId) {
      // Migration 270: credited/refunded are legacy AR dispositions, and they
      // are edges in the transition matrix like any other move.
      const { error: evoucherError } = await supabase.rpc("evoucher_transition", {
        p_evoucher_id: evoucherId,
        p_to_status: nextStatus,
        p_notes: nextNotes,
      });

      if (evoucherError) throw new Error(evoucherError.message);
    }

    return data;
  }

  const { error: moveError } = await supabase.rpc("evoucher_transition", {
    p_evoucher_id: collection.id,
    p_to_status: nextStatus,
    p_notes: nextNotes,
  });
  if (moveError) throw new Error(moveError.message);

  const { data, error } = await supabase
    .from("evouchers")
    .select()
    .eq("id", collection.id)
    .single();

  if (error) throw error;

  return {
    ...collection,
    ...data,
    status: nextStatus,
    notes: nextNotes,
    updated_at: nextUpdatedAt,
  };
}
