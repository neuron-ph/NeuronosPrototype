import { useState } from "react";
import { SidePanel } from "../common/SidePanel";
import { NeuronLogo } from "../NeuronLogo";
import { MessageSquare } from "lucide-react";

interface BetaWelcomeScreenProps {
  userId: string;
  onDone: () => void;
}

export function BetaWelcomeScreen({ userId, onDone }: BetaWelcomeScreenProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Only persist the ack when the user explicitly clicks the button.
  // Closing via backdrop/ESC will show the panel again next login.
  const handleDone = () => {
    localStorage.setItem(`neuron_beta_acked_${userId}`, "true");
    onDone();
  };

  const title = (
    <div className="flex items-center justify-between w-full pr-2">
      <NeuronLogo height={24} />
      <span
        className="text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full"
        style={{
          background: "var(--theme-bg-surface-tint)",
          color: "var(--theme-action-primary-bg)",
        }}
      >
        Beta
      </span>
    </div>
  );

  const footer = (
    <div
      className="px-12 py-6 flex flex-col gap-5"
      style={{ borderTop: "1px solid var(--theme-border-default)" }}
    >
      {/* Checkbox */}
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <button
          type="button"
          role="checkbox"
          aria-checked={acknowledged}
          onClick={() => setAcknowledged(!acknowledged)}
          className="mt-0.5 w-5 h-5 shrink-0 rounded-md flex items-center justify-center transition-all duration-150 focus:outline-none"
          style={{
            border: acknowledged ? "none" : "1.5px solid var(--theme-border-default)",
            background: acknowledged ? "var(--theme-action-primary-bg)" : "transparent",
          }}
        >
          {acknowledged && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path
                d="M1 4L4 7.5L10 1"
                stroke="var(--theme-action-primary-text)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <span
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--theme-text-muted)" }}
        >
          I understand this is a beta — features and data may change as we
          improve the system.
        </span>
      </label>

      {/* CTA */}
      <button
        onClick={handleDone}
        disabled={!acknowledged}
        className="w-full py-3 rounded-xl text-[14px] font-semibold transition-all duration-200 focus:outline-none"
        style={{
          background: acknowledged ? "var(--theme-action-primary-bg)" : "var(--theme-state-hover)",
          color: acknowledged ? "var(--theme-action-primary-text)" : "var(--theme-text-muted)",
          border: acknowledged ? "none" : "1px solid var(--theme-border-default)",
          cursor: acknowledged ? "pointer" : "not-allowed",
        }}
      >
        I'm ready — let's go
      </button>
    </div>
  );

  return (
    <SidePanel
      isOpen
      onClose={onDone}
      title={title}
      footer={footer}
      size="md"
      width="480px"
      showCloseButton={false}
    >
      <div className="px-12 py-8 flex flex-col gap-6 overflow-y-auto h-full">

        {/* Headline */}
        <div className="flex flex-col gap-2">
          <h1
            className="text-[24px] font-bold leading-snug"
            style={{ color: "var(--theme-text-primary)", letterSpacing: "-0.4px" }}
          >
            Welcome to Neuron OS.
          </h1>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--theme-text-muted)" }}
          >
            You’re using an early beta version of the Falcons System.
          </p>
        </div>

        <div style={{ height: 1, background: "var(--theme-border-default)" }} />

        {/* Body copy */}
        <div className="flex flex-col gap-4">
          <p
            className="text-[13px] leading-[1.75]"
            style={{ color: "var(--theme-text-primary)" }}
          >
            Neuron OS was built for your team.
          </p>
          <p
            className="text-[13px] leading-[1.75]"
            style={{ color: "var(--theme-text-primary)" }}
          >
            Since we're still in beta, things will keep improving, and some
            features may feel a little rough around the edges for now. That's
            part of the process — and your feedback helps shape what the system
            becomes.
          </p>
          <p
            className="text-[13px] leading-[1.75]"
            style={{ color: "var(--theme-text-primary)" }}
          >
            Everything you do here is live, so feel free to explore the modules,
            try the workflows, and see how it feels in real use.
          </p>
        </div>

        {/* Feedback callout */}
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3.5"
          style={{
            background: "var(--theme-state-hover)",
            border: "1px solid var(--theme-border-default)",
          }}
        >
          <MessageSquare
            size={14}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--theme-action-primary-bg)" }}
          />
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: "var(--theme-text-muted)" }}
          >
            Spotted something off? Hit the{" "}
            <strong
              style={{ color: "var(--theme-text-primary)", fontWeight: 600 }}
            >
              Feedback button
            </strong>{" "}
            (bottom-right corner). We read every single one.
          </p>
        </div>

      </div>
    </SidePanel>
  );
}
