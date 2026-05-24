// Teller API client wrapper.
//
// Teller requires mTLS on every API call — even in sandbox. Without a
// client certificate the API responds with TLS handshake failures, which
// is the most common reason a "wired" Teller flow appears to silently do
// nothing (the routes 502 on every accounts fetch).
//
// We carry the cert + key in two env vars:
//   TELLER_CERT_PEM — PEM-encoded client certificate
//   TELLER_KEY_PEM  — PEM-encoded client private key
//
// Both can hold the PEM literal with real newlines; we also accept
// "\n"-escaped newlines (which is what Vercel's dashboard often produces
// when you paste a multi-line value into a single-line input) so the
// same envs work locally and in deploy.
//
// The Agent is built lazily once per process and reused across requests.

// Important: we call undici's own `fetch` (not the global) so the
// `dispatcher` option carrying our mTLS Agent is guaranteed to take
// effect. Next.js wraps global `fetch` for caching + dedupe and on
// Vercel's serverless runtime that wrapper may drop the `dispatcher`
// option, dropping mTLS with it. The TLS handshake then fails before
// the request ever lands and the user sees an opaque
// "TypeError: fetch failed".
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

const TELLER_API_BASE = "https://api.teller.io";

let cached: Agent | null = null;

function normalizePem(raw: string): string {
  // Strip surrounding quotes some dashboard inputs add, then accept
  // both real newlines and "\n"-escaped form so the same env value
  // works in .env.local and in hosted dashboards.
  let v = raw.trim();
  if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (v.includes("\\n")) v = v.replace(/\\n/g, "\n");
  return v;
}

function getAgent(): Agent | null {
  if (cached) return cached;
  const certRaw = process.env.TELLER_CERT_PEM;
  const keyRaw  = process.env.TELLER_KEY_PEM;
  if (!certRaw || !keyRaw) return null;
  cached = new Agent({
    connect: {
      cert: normalizePem(certRaw),
      key:  normalizePem(keyRaw),
    },
  });
  return cached;
}

export class TellerNotConfiguredError extends Error {
  constructor() {
    super("Teller mTLS certificate not configured (TELLER_CERT_PEM / TELLER_KEY_PEM).");
    this.name = "TellerNotConfiguredError";
  }
}

/** Authenticated GET against Teller's API. Throws TellerNotConfiguredError
 *  if the mTLS cert isn't installed; route handlers should catch and 503.
 *  Returns a standard `Response` (undici fetch's Response is interchangeable
 *  with the global one for our call sites). */
export async function tellerFetch(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const agent = getAgent();
  if (!agent) throw new TellerNotConfiguredError();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`);
  try {
    // Cast through unknown — undici's RequestInit / Response are
    // structurally compatible with the DOM types for our usage, but
    // TS treats them as distinct (the body union differs).
    const res = await undiciFetch(`${TELLER_API_BASE}${path}`, {
      method:  init.method,
      body:    init.body as unknown as undefined,
      headers,
      dispatcher: agent as Dispatcher,
    });
    return res as unknown as Response;
  } catch (e) {
    // undici's "fetch failed" wraps the real TLS / network error in
    // `.cause`. Surface it so the route's log shows the actual reason.
    const cause = (e as { cause?: unknown })?.cause;
    if (cause) {
      const causeMsg = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
      throw new Error(`teller fetch failed — ${causeMsg}`, { cause });
    }
    throw e;
  }
}

export function tellerConfigured(): boolean {
  return !!process.env.TELLER_CERT_PEM && !!process.env.TELLER_KEY_PEM;
}
