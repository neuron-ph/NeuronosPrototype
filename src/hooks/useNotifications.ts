import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { useUser } from "./useUser";
import { queryKeys } from "../lib/queryKeys";
import {
  markEntityRead,
  markModuleRead,
  type NotifModule,
  type NotifSubSection,
  type NotifEntityType,
  type NotifEventKind,
  type NotifSummary,
} from "../utils/notifications";

export interface NotifCounter {
  module: NotifModule;
  sub_section: string; // '' = module-level rollup
  unread_count: number;
}

export interface NotifFeedItem {
  event_id: string;
  delivered_at: string;
  read_at: string | null;
  actor_user_id: string | null;
  module: NotifModule;
  sub_section: string | null;
  entity_type: NotifEntityType;
  entity_id: string;
  event_kind: NotifEventKind;
  summary: NotifSummary;
}

/**
 * Realtime-backed notifications feed for the current user.
 * - counters: indexed by module + sub_section; sidebar reads this
 * - moduleCount(module): rollup count for one module
 * - subSectionCount(module, sub): count under a sub-section
 * - total: sum of module-level rollups
 * - feed / unreadFeed: "what's new" list
 * - markEntityAsRead / markModuleAsRead / markSubSectionAsRead: clear helpers
 */
export function useNotifications() {
  const { user } = useUser();
  const userId = user?.id || null;
  const qc = useQueryClient();

  // ── counters ────────────────────────────────────────────────────────────
  const countersQuery = useQuery({
    queryKey: queryKeys.notifications.counters(userId || "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<NotifCounter[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc(
        "get_my_notification_counters",
        { p_user_id: userId },
      );
      if (error) {
        console.warn("[notifications] counters fetch failed", error.message);
        return [];
      }
      return (data || []) as NotifCounter[];
    },
    staleTime: 30_000,
  });

  const counters = countersQuery.data || [];

  // ── feed (lazy — only fetched when consumer asks) ────────────────────────
  const feedQuery = useQuery({
    queryKey: queryKeys.notifications.feed(userId || "anon", false),
    enabled: false, // call .refetch() / setEnabled via consumer
    queryFn: async (): Promise<NotifFeedItem[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc("get_my_notifications", {
        p_user_id: userId,
        p_limit: 100,
        p_unread_only: false,
      });
      if (error) {
        console.warn("[notifications] feed fetch failed", error.message);
        return [];
      }
      return (data || []) as NotifFeedItem[];
    },
  });

  // ── realtime subscription ────────────────────────────────────────────────
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notif_user_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_counters",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({
            queryKey: queryKeys.notifications.counters(userId),
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_recipients",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.notifications.all() });
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, qc]);

  // ── derived helpers ─────────────────────────────────────────────────────
  const moduleCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of counters) {
      if (c.sub_section === "") map[c.module] = c.unread_count;
    }
    return (m: NotifModule) => map[m] || 0;
  }, [counters]);

  const subSectionCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of counters) {
      if (c.sub_section) map[`${c.module}/${c.sub_section}`] = c.unread_count;
    }
    return (m: NotifModule, sub: NotifSubSection) =>
      map[`${m}/${sub}`] || 0;
  }, [counters]);

  const total = useMemo(
    () => counters.filter((c) => c.sub_section === "").reduce((a, c) => a + c.unread_count, 0),
    [counters],
  );

  // ── mark-read wrappers (optimistic + Realtime confirms) ─────────────────
  const markEntityAsRead = async (entityType: NotifEntityType, entityId: string) => {
    if (!userId) return 0;
    const n = await markEntityRead(userId, entityType, entityId);
    if (n > 0) {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    }
    return n;
  };

  const markModuleAsRead = async (m: NotifModule) => {
    if (!userId) return 0;
    const n = await markModuleRead(userId, m, null);
    if (n > 0) qc.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    return n;
  };

  const markSubSectionAsRead = async (m: NotifModule, sub: NotifSubSection) => {
    if (!userId) return 0;
    const n = await markModuleRead(userId, m, sub);
    if (n > 0) qc.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    return n;
  };

  return {
    counters,
    moduleCount,
    subSectionCount,
    total,
    isLoading: countersQuery.isLoading,
    feed: feedQuery.data || [],
    refetchFeed: feedQuery.refetch,
    feedLoading: feedQuery.isFetching,
    markEntityAsRead,
    markModuleAsRead,
    markSubSectionAsRead,
  };
}

/**
 * Mark an entity's notifications as read for the current user when this hook
 * mounts (or when the entity id changes). Use in detail components so opening
 * a booking/evoucher/etc. clears its red dot.
 */
export function useMarkEntityReadOnMount(
  entityType: NotifEntityType,
  entityId: string | null | undefined,
) {
  const { user } = useUser();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user?.id || !entityId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("mark_entity_read", {
        p_user_id: user.id,
        p_entity_type: entityType,
        p_entity_id: entityId,
      });
      if (cancelled) return;
      if (error) {
        console.warn("[notifications] mark_entity_read failed", error.message);
        return;
      }
      if ((data as number) > 0) {
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all() });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, entityType, entityId, qc]);
}

/**
 * Per-list-row dot helper. Pass the visible entity_ids for a list view and get
 * back the subset that has unread events for the current user.
 */
export function useUnreadEntityIds(
  entityType: NotifEntityType,
  entityIds: string[],
) {
  const { user } = useUser();
  const userId = user?.id || null;
  // Sort+join keeps the cache key stable when the same set is passed in different orders.
  const idsKey = useMemo(() => [...entityIds].sort().join(","), [entityIds]);

  const query = useQuery({
    queryKey: [...queryKeys.notifications.unreadEntities(userId || "anon", entityType), idsKey],
    enabled: !!userId && entityIds.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      if (!userId || entityIds.length === 0) return new Set();
      const { data, error } = await supabase.rpc("get_my_unread_entity_ids", {
        p_user_id: userId,
        p_entity_type: entityType,
        p_entity_ids: entityIds,
      });
      if (error) {
        console.warn("[notifications] unread entity ids failed", error.message);
        return new Set();
      }
      return new Set(((data || []) as Array<{ entity_id: string }>).map((r) => r.entity_id));
    },
    staleTime: 30_000,
  });

  return query.data || new Set<string>();
}
