// Public booking page at /book/[slug]. Server component: loads the link by
// slug via the service-role client and hands a trimmed, public-safe shape to
// the interactive BookingClient. No session required (allowlisted in proxy.ts).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicLink } from "@/lib/scheduling/public-link";
import BookingClient, { type PublicLinkView } from "@/components/scheduling/BookingClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadPublicLink(slug);
  if (!bundle) return { title: "Book a time" };
  return { title: `${bundle.link.title} · ${bundle.organizer.name}` };
}

export default async function BookPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const bundle = await loadPublicLink(slug);
  if (!bundle) notFound();

  const { link, organizer } = bundle;
  const view: PublicLinkView = {
    title:            link.title,
    description:      link.description,
    duration_minutes: link.duration_minutes,
    location_type:    link.location_type,
    location_detail:  link.location_detail,
    timezone:         link.timezone,
    kind:             link.kind,
  };

  return <BookingClient slug={slug} link={view} organizer={organizer} />;
}
