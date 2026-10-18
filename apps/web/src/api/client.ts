import type { paths } from "./schema";

type JsonResponse<Path extends keyof paths, Method extends keyof paths[Path], Status extends number> =
  paths[Path][Method] extends { responses: { [S in Status]: { content: { "application/json": infer Body } } } }
    ? Body
    : never;

export type Menu = JsonResponse<"/menu", "get", 200>;
export type Category = Menu["categories"][number];
export type Product = Category["products"][number];

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export const KIOSK_ID: string = import.meta.env.VITE_KIOSK_ID ?? "kiosk-1";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API answered ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Kiosk-Id", KIOSK_ID);
  headers.set("X-Request-Id", crypto.randomUUID());
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export function getMenu() {
  return request<Menu>("/menu");
}
