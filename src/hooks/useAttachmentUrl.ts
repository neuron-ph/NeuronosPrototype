/**
 * Signed-URL resolution for attachments rendered inline (finding M1).
 *
 * Click handlers can call `openAttachment()` directly, but an `<img src>` needs
 * the URL before paint. This resolves once per stored value and holds it for the
 * life of the component; signed URLs last an hour, comfortably longer than a
 * detail panel stays open.
 */
import { useEffect, useState } from "react";
import { resolveAttachmentUrl, resolveAttachmentUrls } from "../utils/attachmentUrl";

/** Resolve one stored attachment value. Returns null until it resolves, and if it fails. */
export function useAttachmentUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!stored) { setUrl(null); return; }
    resolveAttachmentUrl(stored).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => { cancelled = true; };
  }, [stored]);

  return url;
}

/**
 * Resolve a list, keyed by the stored value so a caller can look each one up.
 * Re-resolves only when the set of stored values changes.
 */
export function useAttachmentUrls(
  stored: Array<string | null | undefined>,
): Record<string, string> {
  // Newline-joined, not space-joined: upload paths embed the original file name,
  // which routinely contains spaces.
  const key = stored.filter(Boolean).join("\n");
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const values = key ? key.split("\n") : [];
    if (values.length === 0) { setUrls({}); return; }
    resolveAttachmentUrls(values).then((resolved) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      values.forEach((value, i) => {
        const url = resolved[i];
        if (url) next[value] = url;
      });
      setUrls(next);
    });
    return () => { cancelled = true; };
  }, [key]);

  return urls;
}
