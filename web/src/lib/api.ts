export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? body?.error ?? body?.message;
    throw new Error(typeof message === "string" ? message : `Request failed (${response.status}). Please try again.`);
  }
  if (body === null) throw new Error("The server returned an invalid response. Please try again.");
  return body as T;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
export const number = (value: number, digits = 2) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const dateTime = (value: string) => new Date(value).toLocaleString(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});
