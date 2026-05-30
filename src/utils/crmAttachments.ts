import { supabase } from "./supabase/client";

export interface CrmAttachment {
  name: string;
  size: number;
  type: string;
  url?: string;
}

export function getAttachmentKind(fileType: string, fileName: string): "pdf" | "image" | "document" | "spreadsheet" {
  const lowerName = fileName.toLowerCase();
  if (fileType.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf";
  if (fileType.startsWith("image/")) return "image";
  if (
    fileType.includes("sheet") ||
    fileType.includes("excel") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".csv")
  ) {
    return "spreadsheet";
  }
  return "document";
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadCrmAttachments(
  files: File[],
  folder: "crm_activities" | "tasks" | "evouchers",
  entityId: string,
): Promise<CrmAttachment[]> {
  const uploaded: CrmAttachment[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const uniquePart = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `${folder}/${entityId}/${uniquePart}-${safeName}`;
    const { error } = await supabase.storage.from("attachments").upload(filePath, file);
    if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`);

    const { data } = supabase.storage.from("attachments").getPublicUrl(filePath);
    uploaded.push({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      url: data.publicUrl,
    });
  }

  return uploaded;
}
