import { useNavigate } from "react-router";
import illustSrc from "../../assets/empty container illust.svg";

type ErrorType = "404" | "403" | "500";

const ERROR_CONTENT: Record<ErrorType, { heading: string; subtext: string }> = {
  "404": {
    heading: "Page not found",
    subtext:
      "The page you're looking for may have been moved, deleted, or doesn't exist.",
  },
  "403": {
    heading: "Access restricted",
    subtext:
      "You don't have permission to view this page. Contact your administrator.",
  },
  "500": {
    heading: "Something went wrong",
    subtext:
      "An unexpected error occurred. If this keeps happening, contact support.",
  },
};

interface ErrorPageProps {
  errorType?: ErrorType;
  /** Dev-mode detail string — only rendered when import.meta.env.DEV is true */
  message?: string;
}

export function ErrorPage({ errorType = "404", message }: ErrorPageProps) {
  const navigate = useNavigate();
  const content = ERROR_CONTENT[errorType];
  const showDevDetail = message && import.meta.env.DEV;

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "var(--neuron-bg-elevated)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "clamp(16px, 2vw, 24px)",
          maxWidth: "960px",
          width: "100%",
        }}
      >
        {/* Illustration — green in light, medium-light gray in dark */}
        <div
          style={{
            flex: "0 0 auto",
            width: "clamp(420px, 65%, 780px)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <img
            src={illustSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="[filter:brightness(0)_saturate(100%)_invert(38%)_sepia(74%)_saturate(430%)_hue-rotate(120deg)_brightness(75%)_contrast(88%)] dark:[filter:brightness(0)_invert(0.54)]"
            style={{
              width: "100%",
              userSelect: "none",
              transition: "filter 200ms ease",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Error code */}
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--neuron-ink-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}
          >
            {errorType}
          </p>

          {/* Heading */}
          <h1
            style={{
              fontSize: "clamp(28px, 3.5vw, 40px)",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)",
              letterSpacing: "-1.2px",
              lineHeight: 1.1,
              marginBottom: "14px",
            }}
          >
            {content.heading}
          </h1>

          {/* Subtext */}
          <p
            style={{
              fontSize: "14px",
              color: "var(--neuron-ink-muted)",
              lineHeight: 1.65,
              maxWidth: "38ch",
              marginBottom: showDevDetail ? "12px" : "28px",
            }}
          >
            {content.subtext}
          </p>

          {/* Dev error detail — dev environment only */}
          {showDevDetail && (
            <pre
              style={{
                marginBottom: "28px",
                padding: "12px 14px",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                fontSize: "11px",
                color: "var(--neuron-ink-muted)",
                fontFamily: "ui-monospace, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxWidth: "420px",
              }}
            >
              {message}
            </pre>
          )}

          {/* Primary CTA */}
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              backgroundColor: "var(--neuron-action-primary)",
              color: "var(--neuron-action-primary-text)",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid var(--neuron-action-primary)",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "background-color 140ms ease, border-color 140ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "var(--neuron-action-primary-hover)";
              e.currentTarget.style.borderColor =
                "var(--neuron-action-primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                "var(--neuron-action-primary)";
              e.currentTarget.style.borderColor =
                "var(--neuron-action-primary)";
            }}
          >
            Back to dashboard
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
