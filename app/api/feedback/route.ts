// Receives in-app user feedback (note + optional file attachments) and emails
// it to the Perennial team. Auth-gated so we know who sent it; replyTo is set
// to the submitter so the team can reply directly.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const FEEDBACK_TO     = "elliott@perennial.design";
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB total across attachments

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email isn't configured yet. Try again later." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const message = String(form.get("message") ?? "").trim();
  const page    = String(form.get("page") ?? "").slice(0, 200);
  if (!message) return NextResponse.json({ error: "Please write a message." }, { status: 400 });

  // Build attachments from uploaded files (base64), capped by total size.
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let total = 0;
  const attachments: { filename: string; content: string }[] = [];
  for (const f of files) {
    total += f.size;
    if (total > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "Attachments exceed 20 MB total." }, { status: 413 });
    }
    const buf = Buffer.from(await f.arrayBuffer());
    attachments.push({ filename: f.name || "attachment", content: buf.toString("base64") });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, studio_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const name   = profile?.display_name || user.email || "Unknown user";
  const studio = profile?.studio_name || "";

  // Feedback comes from help@<domain> (derived from the verified RESEND_FROM
  // domain), separate from invoices@/bookings@. Overridable via env.
  const baseFrom = process.env.RESEND_FROM ?? "onboarding@resend.dev";
  const helpAddr = process.env.RESEND_FEEDBACK_FROM ?? baseFrom.replace(/^[^@]+@/, "help@");
  const from = `Perennial Feedback <${helpAddr}>`;
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; font-size: 14px; color: #1f211a;">
      <p style="white-space: pre-wrap; line-height: 1.6; margin: 0 0 16px;">${esc(message)}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
      <p style="font-size: 12px; color: #888; line-height: 1.6; margin: 0;">
        From: ${esc(name)}${studio ? ` · ${esc(studio)}` : ""}<br/>
        Email: ${esc(user.email ?? "—")}<br/>
        ${page ? `Page: ${esc(page)}<br/>` : ""}
        ${attachments.length ? `Attachments: ${attachments.length}` : ""}
      </p>
    </div>`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: FEEDBACK_TO,
      replyTo: user.email ?? undefined,
      subject: `Perennial feedback — ${name}`,
      html,
      attachments: attachments.length ? attachments : undefined,
    });
    if (error) {
      console.error("Feedback email error:", error);
      return NextResponse.json({ error: "Couldn't send feedback. Please try again." }, { status: 500 });
    }
  } catch (e) {
    console.error("Feedback send threw:", e);
    return NextResponse.json({ error: "Couldn't send feedback. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
