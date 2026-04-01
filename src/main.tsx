import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import App from "./App.tsx";
import "./styles/globals.css";
import { bootstrapTheme } from "./theme/themeBootstrap";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  environment: import.meta.env.MODE,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

bootstrapTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<SentryFallback />}>
    <QueryClientProvider client={queryClient}>
      <App />
      {false && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </Sentry.ErrorBoundary>
);

function SentryFallback() {
  return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "system-ui" }}>
      <h2 style={{ color: "var(--theme-text-primary)" }}>Something went wrong</h2>
      <p style={{ color: "var(--theme-text-muted)" }}>An unexpected error occurred. Please refresh the page.</p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 16,
          padding: "8px 24px",
          background: "var(--theme-action-primary-bg)",
          color: "var(--theme-action-primary-text)",
          border: "1px solid var(--theme-action-primary-border)",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}
