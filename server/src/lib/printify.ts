// Every outbound call to Printify goes through here so none of them can hang
// a request indefinitely, and so a non-OK response can't get silently
// forwarded to the client (or crash on .json()) as if it had succeeded.
export class PrintifyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TIMEOUT_MS = 15_000;

export async function printifyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new PrintifyError(504, "Printify did not respond in time");
    }
    throw new PrintifyError(502, "Could not reach Printify");
  }
}

// The common "call Printify, use its JSON" pattern — throws instead of
// returning Printify's error body (or a parse failure) as if it were data.
export async function printifyJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await printifyFetch(url, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const details = [data?.message, data?.errors?.reason ?? (data?.errors ? JSON.stringify(data.errors) : null)]
      .filter(Boolean).join(": ") || res.statusText || "Printify request failed";
    throw new PrintifyError(res.status, `Printify ${options?.method ?? "GET"} ${new URL(url).pathname} (HTTP ${res.status}): ${details}`);
  }
  return data as T;
}
