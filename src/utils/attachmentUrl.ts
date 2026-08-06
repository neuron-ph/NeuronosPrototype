/**
 * Attachment URL resolution (finding M1).
 *
 * The `attachments` bucket was public, so every writer called `getPublicUrl()`
 * and stored the resulting permanent URL on the row — across 12 columns in 12
 * tables. That is why 424 real client documents were fetchable by anyone with
 * the link and no account.
 *
 * Closing it means `public = false`, and a private bucket has no permanent URL:
 * you mint a short-lived signed one at render time. So writers now store the
 * storage PATH, and readers resolve it here.
 *
 * Both shapes have to work, forever. Existing rows hold full public URLs and
 * there is no backfill — `toStoragePath` strips a stored public URL back down to
 * its path, so a row written in 2025 resolves exactly like one written today.
 */
import { supabase } from "./supabase/client";

const BUCKET = "attachments";
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Normalise whatever is on the row into a bucket-relative storage path.
 * Accepts a bare path (what writers store now) or a full public URL (legacy).
 * Returns null for an empty or unparseable value.
 */
export function toStoragePath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const value = stored.trim();
  if (!value) return null;

  // Legacy: https://<ref>.supabase.co/storage/v1/object/public/attachments/<path>
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = value.indexOf(marker);
  if (at !== -1) return decodeURIComponent(value.slice(at + marker.length));

  // A signed URL that somehow got persisted — recover the path, drop the token.
  const signedMarker = `/storage/v1/object/sign/${BUCKET}/`;
  const signedAt = value.indexOf(signedMarker);
  if (signedAt !== -1) {
    return decodeURIComponent(value.slice(signedAt + signedMarker.length).split("?")[0]);
  }

  // Anything else absolute is not ours — refuse rather than guess.
  if (/^https?:\/\//i.test(value)) return null;

  return value.replace(/^\/+/, "");
}

/**
 * Mint a short-lived URL for a stored attachment value.
 * Returns null if the value is unusable or the caller may not read the object —
 * callers should render a disabled/hidden control rather than a broken link.
 */
export async function resolveAttachmentUrl(
  stored: string | null | undefined,
): Promise<string | null> {
  const path = toStoragePath(stored);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Resolve many at once, preserving order. Used by list views that render a row
 * of thumbnails or links.
 */
export async function resolveAttachmentUrls(
  stored: Array<string | null | undefined>,
): Promise<Array<string | null>> {
  return Promise.all(stored.map((s) => resolveAttachmentUrl(s)));
}

/**
 * Open or download an attachment. Signs at click time, so the URL is never
 * older than the click and never sits in the DOM.
 */
export async function openAttachment(
  stored: string | null | undefined,
  fileName?: string,
): Promise<boolean> {
  const url = await resolveAttachmentUrl(stored);
  if (!url) return false;

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
