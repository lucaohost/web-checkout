import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { App } from "../App.tsx";
import { menu } from "./fixtures.ts";
import { API_URL, server } from "./server.ts";

export function serveMenu(body = menu) {
  server.use(http.get(`${API_URL}/menu`, () => HttpResponse.json(body)));
}

export function renderKiosk(options: { advanceTimers?: (ms: number) => unknown } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup(options.advanceTimers ? { advanceTimers: options.advanceTimers } : {});
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
  return { user };
}

export async function startOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /start your order/i }));
  await screen.findByRole("heading", { name: "Snacks" });
}
