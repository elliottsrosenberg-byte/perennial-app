"use client";

// The greeting + date must reflect the USER'S local time, not the server's.
// Topbar is a server component, so `new Date()` there runs in Vercel's UTC and
// shows the wrong day/part-of-day (e.g. evening ET renders as next-morning UTC).
// We compute on the client after mount — rendering nothing on SSR avoids a
// hydration mismatch, then it fills in instantly.

import { useEffect, useState } from "react";

const DAYS   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function GreetingBlock() {
  const [info, setInfo] = useState<{ greeting: string; date: string } | null>(null);

  useEffect(() => {
    const now  = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const date = `${DAYS[now.getDay()]} · ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    setInfo({ greeting, date });
  }, []);

  if (!info) return null;

  return (
    <>
      <h1 className="font-semibold" style={{ fontSize: "15px", color: "var(--color-charcoal)" }}>
        {info.greeting}.
      </h1>
      <span style={{ color: "var(--color-grey)", fontSize: "12px" }}>·</span>
      <span style={{ fontSize: "12px", color: "var(--color-grey)" }}>{info.date}</span>
    </>
  );
}
