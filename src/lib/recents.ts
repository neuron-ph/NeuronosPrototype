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
const RECENTS_KEY = "neuron_recents_v2";

export function trackRecent(item: RecentItem): void {
  try {
    const existing: RecentItem[] = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    const deduped = [item, ...existing.filter((r) => r.path !== item.path)].slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(deduped));
  } catch {}
}

export function getRecents(): RecentItem[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]") as RecentItem[]).slice(0, 5);
  } catch {
    return [];
  }
}
