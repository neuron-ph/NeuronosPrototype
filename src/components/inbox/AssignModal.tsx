import { useState } from "react";
import { X, UserCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logActivity } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";

interface AssignModalProps {
  ticketId: string;
  ticketSubject?: string;
  department: string;
  onAssigned: () => void;
  onClose: () => void;
}

interface DeptMember { id: string; name: string; role: string; }

export function AssignModal({ ticketId, ticketSubject, department, onAssigned, onClose }: AssignModalProps) {
  const { user } = useUser();
  const [isAssigning, setIsAssigning] = useState(false);
  const [note, setNote] = useState("");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["ticket_assignments", "dept_members", department],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, name, role")
        .eq("department", department);
      return (data || []) as DeptMember[];
    },
    staleTime: 0,
  });

  const handleAssign = async (memberId: string, memberName: string) => {
    if (!user) return;
    setIsAssigning(true);
    try {
      // Insert assignment record
      await supabase.from("ticket_assignments").insert({
        ticket_id: ticketId,
        department,
        assigned_to: memberId,
        assigned_by: user.id,
        assigned_at: new Date().toISOString(),
        note: note.trim() || null,
      });

      // Add assignee as participant if not already
      await supabase.from("ticket_participants").upsert(
        {
          ticket_id: ticketId,
          participant_type: "user",
          user_id: memberId,
          department: null,
          role: "to",
          added_by: user.id,
        },
        { onConflict: "ticket_id,user_id" }
      );

      // Insert system message
      await supabase.from("ticket_messages").insert({
        ticket_id: ticketId,
        sender_id: user.id,
        is_system: true,
        system_event: "assigned",
        system_metadata: {
          assigned_to_name: memberName,
          assigned_by_name: user.name,
          department,
        },
      });

      // Update ticket last_message_at
      await supabase
        .from("tickets")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", ticketId);

      const actor = { id: user!.id, name: user!.name, department: user!.department };
      logActivity("ticket", ticketId, ticketSubject ?? ticketId, "assigned", actor);
      toast.success(`Thread assigned to ${memberName}`);
      onAssigned();
    } catch (err) {
      toast.error("Failed to assign thread");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div
      className="ticketing-ui fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(18,51,43,0.15)" }}
      onClick={onClose}
    >
      <div
        style={{
          width: 400,
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: 12,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--theme-border-default)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--theme-text-primary)" }}>
            Assign to {department} member
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Optional note */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--theme-border-default)" }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the assignee…"
            rows={2}
            style={{
              width: "100%",
              resize: "none",
              border: "1px solid var(--theme-border-default)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 12,
              color: "var(--theme-text-primary)",
              fontFamily: "inherit",
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--neuron-ui-active-border)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-default)")}
          />
        </div>

        {/* Member list */}
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--theme-text-muted)", fontSize: 13 }}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--theme-text-muted)", fontSize: 13 }}>No members found</div>
          ) : (
            members.map((m) => (
              <button
                key={m.id}
                disabled={isAssigning}
                onClick={() => handleAssign(m.id, m.name)}
                className="w-full text-left flex items-center gap-3 transition-colors duration-150"
                style={{
                  padding: "12px 20px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--theme-border-subtle)",
                  cursor: isAssigning ? "wait" : "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--theme-bg-page)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  backgroundColor: "#EEF4F1", border: "1px solid #D7E5E0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "#2E5147", flexShrink: 0,
                }}>
                  {m.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)" }}>{m.name}</p>
                  <p style={{ fontSize: 11, color: "var(--theme-text-muted)", textTransform: "capitalize" }}>{m.role}</p>
                </div>
                <UserCheck size={14} style={{ color: "#2E5147", marginLeft: "auto" }} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
