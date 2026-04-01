import { useState } from "react";
import { MessageSquare, X, Send, Bug, Lightbulb } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { toast } from "sonner@2.0.3";

type FeedbackType = "bug" | "feedback" | "feature";

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: React.ReactNode }[] = [
  { value: "bug", label: "Bug", icon: <Bug size={12} /> },
  { value: "feedback", label: "Feedback", icon: <MessageSquare size={12} /> },
  { value: "feature", label: "Feature Request", icon: <Lightbulb size={12} /> },
];

export function FeedbackButton() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("feedback");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const handleClose = () => {
    setOpen(false);
    setType("feedback");
    setTitle("");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const payload = {
        user_id: user?.id ?? null,
        user_name: user?.name ?? null,
        user_email: user?.email ?? null,
        type,
        title: title.trim(),
        description: description.trim(),
      };

      const { error } = await supabase.from("feedback").insert(payload);
      if (error) throw error;

      // Fire-and-forget email — don't block on it or surface its errors to the user
      supabase.functions.invoke("send-feedback-email", { body: payload }).catch(() => {});

      toast.success("Thanks! We received your feedback.");
      handleClose();
    } catch {
      toast.error("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">

      {/* Floating card */}
      {open && (
        <div
          className="w-96 rounded-xl border overflow-hidden"
          style={{
            background: "var(--theme-bg-surface)",
            borderColor: "var(--theme-border-default)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "#E5E9F0" }}
          >
            <span className="text-[13px] font-semibold" style={{ color: "#12332B" }}>
              Send Feedback
            </span>
            <button
              onClick={handleClose}
              className="transition-colors"
              style={{ color: "#667085" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#12332B")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#667085")}
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">

            {/* Type pills */}
            <div className="flex gap-1.5">
              {TYPE_OPTIONS.map((opt) => {
                const active = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setType(opt.value)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-all"
                    style={{
                      background: active ? "#0F766E" : "transparent",
                      color: active ? "#FFFFFF" : "#667085",
                      borderColor: active ? "#0F766E" : "#E5E9F0",
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#667085" }}>
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary..."
                className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none transition-colors"
                style={{ borderColor: "#E5E9F0", color: "#12332B" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0F766E")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#E5E9F0")}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#667085" }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us what happened or what you'd like to see..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none resize-none transition-colors"
                style={{ borderColor: "#E5E9F0", color: "#12332B" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0F766E")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#E5E9F0")}
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all"
              style={{
                background: canSubmit ? "#0F766E" : "#E5E9F0",
                color: canSubmit ? "#FFFFFF" : "#667085",
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              <Send size={13} />
              {submitting ? "Sending..." : "Submit"}
            </button>

          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
        style={{
          background: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          color: open ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
          e.currentTarget.style.color = "var(--theme-action-primary-bg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--theme-border-default)";
          e.currentTarget.style.color = open ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)";
        }}
      >
        <MessageSquare size={16} />
      </button>
    </div>
  );
}
