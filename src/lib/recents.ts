// Shared recently-viewed tracking for the "Continue Work" dashboard card

export type RecentType = "booking" | "quotation" | "ticket" | "evoucher" | "project" | "inquiry" | "contact" | "customer";

export interface RecentItem {
  label: string;
  sub: string;
  path: string;
  type: RecentType;
  time: string;
}

// Bump version to clear stale entries with wrong types
const RECENTS_VERSION = "v2";

function recentsKey(userId: string): string {
  return `neuron_recents_${RECENTS_VERSION}_${userId}`;
}

export function trackRecent(item: RecentItem, userId: string): void {
  try {
    const key = recentsKey(userId);
    const existing: RecentItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    const deduped = [item, ...existing.filter((r) => r.path !== item.path)].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(deduped));
  } catch {}
}

export function getRecents(userId: string): RecentItem[] {
  try {
    return (JSON.parse(localStorage.getItem(recentsKey(userId)) || "[]") as RecentItem[]).slice(0, 5);
  } catch {
    return [];
  }
}
