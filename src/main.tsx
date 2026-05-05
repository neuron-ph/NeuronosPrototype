import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import App from "./App.tsx";
import "./styles/globals.css";
import { bootstrapTheme } from "./theme/themeBootstrap";
import { startKeepalive } from "./utils/supabase/keepalive";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  environment: import.meta.env.MODE,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
  });
}

bootstrapTheme();
startKeepalive();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,           // 30s — data is considered fresh for 30s
      gcTime: 5 * 60 * 1000,          // 5min — cache kept for background refetch
      retry: 1,
      // Heavy Supabase screens already use manual refresh or realtime.
      // Global focus/mount refetches were replaying too many expensive reads.
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true,        // Refetch after network reconnect
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<div style={{ padding: 40, textAlign: "center" }}>Something went wrong. <button onClick={() => window.location.reload()}>Refresh</button></div>}>
    <QueryClientProvider client={queryClient}>
      <App />
      {false && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </Sentry.ErrorBoundary>
);
