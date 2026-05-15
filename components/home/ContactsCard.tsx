"use client";

import Link from "next/link";
import { UserPlus, Upload } from "lucide-react";
import VisitButton from "@/components/ui/VisitButton";

interface HomeContact {
  id: string;
  first_name: string;
  last_name: string;
  last_contacted_at: string | null;
  company: { name: string } | null;
}

function lastContactedLabel(date: string | null): { text: string; color: string } {
  if (!date) return { text: "Never",       color: "var(--color-red-orange)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0)  return { text: "Today",              color: "var(--color-sage)"       };
  if (days < 7)    return { text: `${days}d ago`,       color: "var(--color-sage)"       };
  if (days < 14)   return { text: `${Math.floor(days / 7)}w ago`,  color: "var(--color-charcoal)" };
  if (days < 60)   return { text: `${Math.floor(days / 7)}w ago`,  color: "#b8860b"               };
  return { text: `${Math.floor(days / 30)}mo ago`,      color: "var(--color-red-orange)" };
}

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

interface Props {
  contacts:   HomeContact[];
  /** Total contact rows in the user's account — not just the stale ones in
   *  `contacts`. Used to differentiate "empty network" from "all up to date." */
  totalCount?: number;
}

export default function ContactsCard({ contacts, totalCount }: Props) {
  // First-time empty state: no contacts at all. Add a contact is the primary
  // ask, but importing a CSV is the other big way users seed a network, so
  // we surface both side-by-side instead of burying Import behind a menu.
  const isEmptyNetwork = (totalCount ?? contacts.length) === 0;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      <div
        className="flex items-center gap-2 px-[14px] py-[10px]"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>
          People
        </span>
        {contacts.length > 0 && (
          <span
            className="text-[10px] px-[7px] py-[1px] rounded-full"
            style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
          >
            {contacts.length}
          </span>
        )}
        <div className="flex-1" />
        <VisitButton href="/people" />
      </div>

      {contacts.length === 0 ? (
        isEmptyNetwork ? (
          <div className="flex flex-col items-center justify-center flex-1 py-6 px-5 text-center">
            <p className="text-[12px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              Build your network
            </p>
            <p className="text-[11px] mb-4" style={{ color: "var(--color-grey)", maxWidth: 220, lineHeight: 1.5 }}>
              Add the people you work with — or import a CSV from Google Contacts in a couple of clicks.
            </p>
            <div className="flex gap-1.5">
              <Link
                href="/people?new=1"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-white"
                style={{ background: "var(--color-sage)" }}
              >
                <UserPlus size={11} strokeWidth={2} />
                New contact
              </Link>
              <Link
                href="/people?import=1"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium"
                style={{ background: "transparent", color: "#6b6860", border: "0.5px solid var(--color-border)" }}
              >
                <Upload size={11} strokeWidth={2} />
                Import CSV
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-7 px-4 text-center flex-1">
            <p className="text-[12px] font-medium mb-0.5" style={{ color: "var(--color-charcoal)" }}>
              All contacts up to date
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              You&apos;re on top of your relationships.
            </p>
          </div>
        )
      ) : (
        contacts.map((c) => {
          const lc = lastContactedLabel(c.last_contacted_at);
          return (
            <div
              key={c.id}
              className="flex items-center gap-2.5 px-[14px] py-[9px]"
              style={{ borderBottom: "0.5px solid var(--color-border)" }}
            >
              <div
                className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                style={{
                  background: "var(--color-cream)",
                  border: "0.5px solid var(--color-border)",
                  color: "#6b6860",
                }}
              >
                {initials(c.first_name, c.last_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>
                  {c.first_name} {c.last_name}
                </div>
                {c.company?.name && (
                  <div className="text-[10px] truncate" style={{ color: "var(--color-grey)" }}>
                    {c.company.name}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-medium shrink-0" style={{ color: lc.color }}>
                {lc.text}
              </span>
            </div>
          );
        })
      )}

    </div>
  );
}
