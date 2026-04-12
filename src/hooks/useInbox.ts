import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { useUser } from "./useUser";
import { queryKeys } from "../lib/queryKeys";

export type TicketType = "fyi" | "request" | "approval";
export type TicketStatus = "draft" | "open" | "acknowledged" | "in_progress" | "done" | "returned" | "archived";
export type TicketPriority = "normal" | "urgent";

export interface ThreadSummary {
  id: string;
  subject: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  linked_record_type: string | null;
  linked_record_id: string | null;
  auto_created: boolean;
  // enriched
  last_message_preview?: string;
  last_message_sender?: string;
  participants?: ParticipantSummary[];
  attachment_count?: number;
  is_unread?: boolean;
}

export interface ParticipantSummary {
  id: string;
  participant_type: "user" | "department";
  participant_user_id: string | null;
  participant_dept: string | null;
  role: "sender" | "to" | "cc";
  user_name?: string;
  user_avatar_url?: string | null;
}

export type InboxTab = "inbox" | "queue" | "sent" | "drafts";

/** Strip HTML tags and decode entities for plain-text preview */
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

export function useInbox() {
  const { user, effectiveDepartment, effectiveRole } = useUser();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<InboxTab>("inbox");

  const isManager = effectiveRole === "manager" || effectiveRole === "director";

  const { data: threads = [], isLoading } = useQuery({
    queryKey: [...queryKeys.inbox.list(), activeTab, user?.id, effectiveDepartment, effectiveRole],
    queryFn: async () => {
      if (!user) return [];

      let ticketIds: string[] = [];

      if (activeTab === "inbox" || activeTab === "queue") {
        const { data: rpcThreads } = await supabase.rpc("get_inbox_threads", {
          p_user_id: user.id,
          p_dept: effectiveDepartment || "",
          p_role: effectiveRole || "rep",
        });

        if (!rpcThreads || rpcThreads.length === 0) return [];

        if (activeTab === "queue" && isManager) {
          const deptTicketIds = new Set<string>();
          const { data: deptParticipants } = await supabase
            .from("ticket_participants")
            .select("ticket_id")
            .eq("participant_type", "department")
            .eq("participant_dept", effectiveDepartment || "");

          (deptParticipants || []).forEach((p) => deptTicketIds.add(p.ticket_id));
          ticketIds = rpcThreads
            .filter((t: { id: string }) => deptTicketIds.has(t.id))
            .map((t: { id: string }) => t.id);
        } else {
          ticketIds = rpcThreads.map((t: { id: string }) => t.id);
        }
      } else if (activeTab === "sent") {
        const { data } = await supabase
          .from("tickets")
          .select("id")
          .eq("created_by", user.id)
          .neq("status", "draft")
          .neq("status", "archived")
          .order("last_message_at", { ascending: false });
        ticketIds = (data || []).map((t) => t.id);
      } else if (activeTab === "drafts") {
        const { data } = await supabase
          .from("tickets")
          .select("id")
          .eq("created_by", user.id)
          .eq("status", "draft")
          .order("updated_at", { ascending: false });
        ticketIds = (data || []).map((t) => t.id);
      }

      if (ticketIds.length === 0) return [];

      const [
        { data: ticketsData },
        { data: participantsData },
        { data: messagesData },
        { data: readData },
        { data: attachData },
      ] = await Promise.all([
        supabase
          .from("tickets")
          .select("*")
          .in("id", ticketIds)
          .order("last_message_at", { ascending: false }),
        supabase
          .from("ticket_participants")
          .select("id, ticket_id, participant_type, participant_user_id, participant_dept, role")
          .in("ticket_id", ticketIds),
        supabase
          .from("ticket_messages")
          .select("ticket_id, body, sender_id, created_at")
          .in("ticket_id", ticketIds)
          .eq("is_system", false)
          .eq("is_retracted", false)
          .order("created_at", { ascending: false }),
        supabase
          .from("ticket_read_receipts")
          .select("ticket_id, last_read_at")
          .eq("user_id", user.id)
          .in("ticket_id", ticketIds),
        supabase
          .from("ticket_attachments")
          .select("ticket_id")
          .in("ticket_id", ticketIds),
      ]);

      if (!ticketsData) return [];

      const userIds = [
        ...new Set(
          (participantsData || [])
            .filter((p) => p.participant_user_id)
            .map((p) => p.participant_user_id as string)
        ),
      ];
      let userMap: Record<string, { name: string; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, name, avatar_url")
          .in("id", userIds);
        userMap = Object.fromEntries((usersData || []).map((u) => [u.id, { name: u.name, avatar_url: u.avatar_url ?? null }]));
      }

      const readMap = Object.fromEntries(
        (readData || []).map((r) => [r.ticket_id, r.last_read_at])
      );

      const attachCountMap: Record<string, number> = {};
      (attachData || []).forEach((a) => {
        attachCountMap[a.ticket_id] = (attachCountMap[a.ticket_id] || 0) + 1;
      });

      const lastMsgMap: Record<string, { body: string; sender_id: string }> = {};
      (messagesData || []).forEach((m) => {
        if (!lastMsgMap[m.ticket_id]) {
          lastMsgMap[m.ticket_id] = { body: m.body || "", sender_id: m.sender_id };
        }
      });

      const enriched: ThreadSummary[] = ticketsData.map((t) => {
        const tParticipants = (participantsData || [])
          .filter((p) => p.ticket_id === t.id)
          .map((p) => ({
            ...p,
            user_name: p.participant_user_id ? userMap[p.participant_user_id]?.name : undefined,
            user_avatar_url: p.participant_user_id ? (userMap[p.participant_user_id]?.avatar_url ?? null) : null,
          }));

        const lastMsg = lastMsgMap[t.id];
        const lastReadAt = readMap[t.id];
        const isUnread =
          (activeTab === "inbox" || activeTab === "queue") &&
          (!lastReadAt || new Date(t.last_message_at) > new Date(lastReadAt));

        return {
          ...t,
          priority: t.priority ?? "normal",
          linked_record_type: t.linked_record_type ?? null,
          linked_record_id: t.linked_record_id ?? null,
          auto_created: t.auto_created ?? false,
          last_message_preview: lastMsg?.body ? stripHtml(lastMsg.body).slice(0, 120) : undefined,
          last_message_sender: lastMsg?.sender_id ? userMap[lastMsg.sender_id]?.name : undefined,
          participants: tParticipants,
          attachment_count: attachCountMap[t.id] || 0,
          is_unread: isUnread,
        };
      });

      return enriched;
    },
    enabled: !!user,
    staleTime: 0,
  });

  const { data: counts = { draftCount: 0, unreadCount: 0, queueCount: 0 } } = useQuery({
    queryKey: [...queryKeys.inbox.all(), "counts", user?.id, effectiveDepartment, effectiveRole],
    queryFn: async () => {
      if (!user) return { draftCount: 0, unreadCount: 0, queueCount: 0 };

      const [{ count: dc }, { data: uc }] = await Promise.all([
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user.id)
          .eq("status", "draft"),
        supabase.rpc("get_unread_count", {
          p_user_id: user.id,
          p_dept: effectiveDepartment || "",
          p_role: effectiveRole || "rep",
        }),
      ]);

      let queueCount = 0;
      if (isManager) {
        const { data: queueParticipants } = await supabase
          .from("ticket_participants")
          .select("ticket_id")
          .eq("participant_type", "department")
          .eq("participant_dept", effectiveDepartment || "");

        const queueIds = (queueParticipants || []).map((p) => p.ticket_id);
        if (queueIds.length > 0) {
          const { count: qc } = await supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .in("id", queueIds)
            .eq("status", "open");
          queueCount = qc || 0;
        }
      }

      return { draftCount: dc || 0, unreadCount: uc || 0, queueCount };
    },
    enabled: !!user,
    staleTime: 0,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() });
  };

  return {
    threads,
    isLoading,
    activeTab,
    setActiveTab,
    draftCount: counts.draftCount,
    unreadCount: counts.unreadCount,
    queueCount: counts.queueCount,
    isManager,
    refresh,
  };
}
