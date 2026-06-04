// Booking confirmation emails — sent to the invitee and the organizer when a
// booking is made through a scheduling link. Best-effort: never throws into
// the caller. Uses the service-role client (the booking flow has no session).
// Note the calendar provider also sends its own invite (sendUpdates=all); this
// is the Perennial-branded confirmation on top of that.

import { createServiceClient } from "@/lib/supabase/service";

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date(iso));
}
function fmtTimeRange(startIso: string, endIso: string, tz: string): string {
  const t = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(startIso)).find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${t(startIso)} – ${t(endIso)} ${zone}`;
}

function html(opts: {
  studio: string; accent: string; logoUrl: string | null;
  headline: string; intro: string;
  title: string; dateLine: string; timeLine: string;
  locationLabel: string | null; meetUrl: string | null;
  withWho: string | null; notes: string | null;
}): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9a9690;width:90px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-size:14px;color:#1f211a;">${value}</td></tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
    <div style="background:${opts.accent};padding:22px 32px;">
      ${opts.logoUrl
        ? `<img src="${opts.logoUrl}" alt="${opts.studio}" height="26" style="height:26px;max-width:200px;object-fit:contain;display:block;" />`
        : `<span style="color:#fff;font-size:16px;font-weight:700;letter-spacing:-0.02em;">${opts.studio}</span>`}
    </div>
    <div style="padding:26px 32px;">
      <p style="font-size:16px;font-weight:600;color:#1f211a;margin:0 0 6px;">${opts.headline}</p>
      <p style="font-size:13px;color:#6b6860;margin:0 0 18px;line-height:1.6;">${opts.intro}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #eff0e7;border-bottom:1px solid #eff0e7;margin-bottom:18px;">
        ${row("Event", opts.title)}
        ${row("When", `${opts.dateLine}<br>${opts.timeLine}`)}
        ${opts.withWho ? row("With", opts.withWho) : ""}
        ${opts.locationLabel ? row("Where", opts.locationLabel) : ""}
        ${opts.notes ? row("Notes", opts.notes) : ""}
      </table>
      ${opts.meetUrl ? `<a href="${opts.meetUrl}" style="display:inline-block;background:${opts.accent};color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Join the video call</a>` : ""}
    </div>
    <div style="background:#f9faf4;padding:14px 32px;border-top:1px solid #eff0e7;">
      <span style="font-size:11px;color:#9a9690;">Scheduled with Perennial</span>
    </div>
  </div>
</body></html>`;
}

export async function sendBookingEmails(bookingId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const supabase = createServiceClient();
    const { data: booking } = await supabase
      .from("scheduling_bookings").select("*").eq("id", bookingId).maybeSingle();
    if (!booking) return;
    const { data: link } = await supabase
      .from("scheduling_links").select("title, location_type, location_detail").eq("id", booking.link_id).maybeSingle();

    const { data: profile } = await supabase
      .from("profiles").select("studio_name, display_name, brand_color, logo_url").eq("user_id", booking.user_id).maybeSingle();
    const studio = profile?.display_name?.trim() || profile?.studio_name?.trim() || "Perennial";
    const accent = profile?.brand_color?.trim() || "#4a5842";
    const logoUrl = profile?.logo_url ?? null;

    const tz = booking.timezone || "America/New_York";
    const dateLine = fmtDate(booking.start_at, tz);
    const timeLine = fmtTimeRange(booking.start_at, booking.end_at, tz);
    const title = link?.title ?? "Meeting";

    const locLabel = (() => {
      switch (link?.location_type) {
        case "phone":     return link.location_detail ? `Phone: ${link.location_detail}` : "Phone call";
        case "in_person": return link.location_detail || "In person";
        case "custom":    return link.location_detail || null;
        case "teams":     return "Microsoft Teams";
        case "google_meet": return "Google Meet";
        case "zoom":      return "Zoom";
        default:          return null;
      }
    })();

    const { data: userRes } = await supabase.auth.admin.getUserById(booking.user_id);
    const ownerEmail = userRes.user?.email ?? null;

    // Booking emails come from bookings@<domain> (separate from invoices@),
    // derived from the verified RESEND_FROM domain. Display name = studio.
    const baseFrom = process.env.RESEND_FROM ?? "invoices@perennial.design";
    const addr = process.env.RESEND_BOOKINGS_FROM ?? baseFrom.replace(/^[^@]+@/, "bookings@");
    const from = `${studio.replace(/["<>]/g, "")} <${addr}>`;
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    // Invitee confirmation
    await resend.emails.send({
      from, to: booking.invitee_email,
      subject: `Confirmed: ${title} — ${dateLine}`,
      html: html({
        studio, accent, logoUrl,
        headline: "You're scheduled",
        intro: `Your meeting with ${studio} is confirmed. A calendar invite has been added to your calendar.`,
        title, dateLine, timeLine,
        locationLabel: locLabel, meetUrl: booking.meet_url,
        withWho: studio, notes: null,
      }),
    });

    // Organizer notification
    if (ownerEmail && ownerEmail !== booking.invitee_email) {
      await resend.emails.send({
        from, to: ownerEmail,
        subject: `New booking: ${booking.invitee_name} — ${dateLine}`,
        html: html({
          studio, accent, logoUrl,
          headline: "New booking",
          intro: `${booking.invitee_name} booked time with you through your scheduling link.`,
          title, dateLine, timeLine,
          locationLabel: locLabel, meetUrl: booking.meet_url,
          withWho: `${booking.invitee_name} (${booking.invitee_email})`,
          notes: booking.invitee_notes || null,
        }),
      });
    }
  } catch (e) {
    console.error("sendBookingEmails failed for", bookingId, e);
  }
}
