import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";

type RealtimeFilter = `${string}=eq.${string}`;

interface UseRealtimeSyncOptions {
  table: string;
  queryKey: QueryKey;
  filter?: RealtimeFilter;
  enabled?: boolean;
}

/**
 * Subscribes to Supabase Realtime postgres_changes on a table and
 * invalidates the matching React Query cache on any INSERT/UPDATE/DELETE.
 */
export function useRealtimeSync({
  table,
  queryKey,
  filter,
  enabled = true,
}: UseRealtimeSyncOptions) {
  const qc = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const channelName = filter
      ? `rt_${table}_${filter}`
      : `rt_${table}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [table, JSON.stringify(queryKey), filter, enabled, qc]);
}

interface UseRealtimeSyncMultiOptions {
  tables: { table: string; queryKey: QueryKey; filter?: RealtimeFilter }[];
  enabled?: boolean;
}

/**
 * Subscribe to multiple tables in a single channel — useful for views
 * that depend on data from several tables (e.g., a booking detail page
 * that also shows billing_line_items and evoucher_line_items).
 */
export function useRealtimeSyncMulti({
  tables,
  enabled = true,
}: UseRealtimeSyncMultiOptions) {
  const qc = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const channelName = `rt_multi_${tables.map((t) => t.table).join("_")}`;
    let channel = supabase.channel(channelName);

    for (const { table, queryKey, filter } of tables) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      );
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [JSON.stringify(tables.map((t) => ({ t: t.table, q: t.queryKey, f: t.filter }))), enabled, qc]);
}
