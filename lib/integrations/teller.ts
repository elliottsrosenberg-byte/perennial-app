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

import { Agent, type Dispatcher } from "undici";

const TELLER_API_BASE = "https://api.teller.io";

let cached: Agent | null = null;

function normalizePem(raw: string): string {
  // Accept both real newlines and the common "\n"-escaped form so the
  // same env value is portable between .env.local and hosted dashboards.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
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
 *  if the mTLS cert isn't installed; route handlers should catch and 503. */
export async function tellerFetch(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const agent = getAgent();
  if (!agent) throw new TellerNotConfiguredError();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`);
  // Next.js's global fetch accepts the undici `dispatcher` option in Node
  // runtimes — that's how we attach the mTLS agent without monkey-patching
  // the global agent.
  const res = await fetch(`${TELLER_API_BASE}${path}`, {
    ...init,
    headers,
    // @ts-expect-error — `dispatcher` is undici-specific; Next's Node
    // runtime forwards it through but the standard fetch type doesn't
    // include it.
    dispatcher: agent as Dispatcher,
  });
  return res;
}

export function tellerConfigured(): boolean {
  return !!process.env.TELLER_CERT_PEM && !!process.env.TELLER_KEY_PEM;
}
