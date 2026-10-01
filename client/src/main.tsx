import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import { TradeProvider } from "./contexts/TradeContext";

const queryClient = new QueryClient();
const rootElement = document.getElementById("root");

function showBootstrapFailure(error: unknown) {
  if (!rootElement || rootElement.childElementCount > 0) return;
  const message = error instanceof Error ? error.message : "The application could not start.";
  rootElement.innerHTML = `<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui;background:#09090b;color:#fafafa"><section style="max-width:640px"><h1 style="font-size:24px;margin:0 0 12px">Xrypt is restarting</h1><p style="line-height:1.5;margin:0 0 10px">The page could not finish loading. Please refresh once; if the issue continues, contact support with this message:</p><code style="display:block;white-space:pre-wrap;word-break:break-word;color:#fca5a5">${message.replace(/[<>&]/g, "")}</code></section></main>`;
}

window.addEventListener("error", event => showBootstrapFailure(event.error ?? event.message));
window.addEventListener("unhandledrejection", event => showBootstrapFailure(event.reason));

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(rootElement!).render(
  <QueryClientProvider client={queryClient}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <TradeProvider>
        <App />
      </TradeProvider>
    </trpc.Provider>
  </QueryClientProvider>
);
