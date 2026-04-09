import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { useUser } from "./useUser";
import { queryKeys } from "../lib/queryKeys";

export interface ThreadMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_name?: string;
  sender_department?: string;
  sender_avatar_url?: string | null;
  body: string | null;
  is_system: boolean;
  system_event: string | null;
  system_metadata: Record<string, any> | null;
  is_retracted: boolean;
  retracted_at: string | null;
  retracted_by: string | null;
  created_at: string;
  attachments?: ThreadAttachment[];
}

export interface ThreadAttachment {
  id: string;
  message_id: string;
  attachment_type: "file" | "entity";
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  uploaded_by: string;
}

export interface ThreadParticipant {
  id: string;
  participant_type: "user" | "department";
  participant_user_id: string | null;
  participant_dept: string | null;
  role: "sender" | "to" | "cc";
  user_name?: string;
  user_department?: string;
  user_avatar_url?: string | null;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  type: "fyi" | "request" | "approval";
  priority: "normal" | "urgent";
  status: "draft" | "open" | "acknowledged" | "in_progress" | "done" | "returned" | "archived";
  created_by: string;
  created_by_name?: string;
  created_by_department?: string;
  created_by_avatar_url?: string | null;
  created_at: string;
  last_message_at: string;
  // Workflow linkage
  linked_record_type: string | null;
  linked_record_id: string | null;
  auto_created: boolean;
  resolution_action: string | null;
  // Return tracking
  return_reason: string | null;
  returned_at: string | null;
  returned_by: string | null;
  returned_by_name?: string;
  // Approval
  approval_result: "accepted" | "declined" | null;
  approval_decided_at: string | null;
  approval_decided_by: string | null;
  messages: ThreadMessage[];
  participants: ThreadParticipant[];
  assignment?: { assigned_to: string; assigned_to_name?: string; assigned_by: string; assigned_by_name?: string; department: string };
}

export function useThread(ticketId: string | null) {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const markAsRead = useCallback(async (tid: string, lastMsgId: string) => {
    if (!user) return;
    await supabase.from("ticket_read_receipts").upsert(
      { ticket_id: tid, user_id: user.id, last_read_at: new Date().toISOString(), last_read_message_id: lastMsgId },
      { onConflict: "ticket_id,user_id" }
    );
  }, [user]);

  const { data: thread = null, isLoading } = useQuery({
    queryKey: queryKeys.inbox.thread(ticketId ?? ""),
    queryFn: async () => {
      if (!ticketId || !user) return null;

      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (!ticket) return null;

      const { data: participants } = await supabase
        .from("ticket_participants")
        .select("*")
        .eq("ticket_id", ticketId);

      const { data: messages } = await supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      const { data: attachments } = await supabase
        .from("ticket_attachments")
        .select("*")
        .eq("ticket_id", ticketId);

      const { data: assignment } = await supabase
        .from("ticket_assignments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const allUserIds = new Set<string>();
      allUserIds.add(ticket.created_by);
      (participants || []).forEach((p) => { if (p.participant_user_id) allUserIds.add(p.participant_user_id); });
      (messages || []).forEach((m) => { allUserIds.add(m.sender_id); if (m.retracted_by) allUserIds.add(m.retracted_by); });
      if (assignment) { allUserIds.add(assignment.assigned_to); allUserIds.add(assignment.assigned_by); }

      const { data: usersData } = await supabase
        .from("users")
        .select("id, name, department, avatar_url")
        .in("id", [...allUserIds]);
      const userMap = Object.fromEntries((usersData || []).map((u) => [u.id, u]));

      const attachByMsg: Record<string, ThreadAttachment[]> = {};
      (attachments || []).forEach((a) => {
        if (!attachByMsg[a.message_id]) attachByMsg[a.message_id] = [];
        attachByMsg[a.message_id].push(a);
      });

      const enrichedMessages: ThreadMessage[] = (messages || []).map((m) => ({
        ...m,
        sender_name: userMap[m.sender_id]?.name,
        sender_department: userMap[m.sender_id]?.department,
        sender_avatar_url: userMap[m.sender_id]?.avatar_url ?? null,
        attachments: attachByMsg[m.id] || [],
      }));

      const enrichedParticipants: ThreadParticipant[] = (participants || []).map((p) => ({
        ...p,
        user_name: p.participant_user_id ? userMap[p.participant_user_id]?.name : undefined,
        user_department: p.participant_user_id ? userMap[p.participant_user_id]?.department : undefined,
        user_avatar_url: p.participant_user_id ? (userMap[p.participant_user_id]?.avatar_url ?? null) : null,
      }));

      const detail: ThreadDetail = {
        ...ticket,
        created_by_name: userMap[ticket.created_by]?.name,
        created_by_department: userMap[ticket.created_by]?.department,
        created_by_avatar_url: userMap[ticket.created_by]?.avatar_url ?? null,
        messages: enrichedMessages,
        participants: enrichedParticipants,
        assignment: assignment
          ? {
              ...assignment,
              assigned_to_name: userMap[assignment.assigned_to]?.name,
              assigned_by_name: userMap[assignment.assigned_by]?.name,
            }
          : undefined,
      };

      // Mark as read — use last non-system message id
      const lastMsg = [...enrichedMessages].reverse().find((m) => !m.is_system);
      if (lastMsg) markAsRead(ticketId, lastMsg.id);

      return detail;
    },
    enabled: !!ticketId && !!user,
    staleTime: 0,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.inbox.thread(ticketId ?? "") });
  };

  return { thread, isLoading, refresh };
}
