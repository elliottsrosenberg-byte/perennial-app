"use client";

import { useState } from "react";

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  studioName: string | null;
  onboarded: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid var(--color-border, #e5e7eb)",
  textAlign: "left",
  verticalAlign: "middle",
};

export default function AdminUsersTable({
  rows,
  currentAdminId,
}: {
  rows: AdminUserRow[];
  currentAdminId: string;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [active, setActive] = useState<{ email: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function viewAs(userId: string) {
    setError(null);
    setLoadingId(userId);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create link");
      setActive({ email: data.email, url: data.url });
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create link");
    } finally {
      setLoadingId(null);
    }
  }

  async function copy() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.url);
      setCopied(true);
    } catch {
      /* clipboard blocked — the link is selectable in the box */
    }
  }

  return (
    <>
      {error && (
        <div style={{ color: "var(--color-red-orange, #c0392b)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-surface-muted, #f9fafb)" }}>
              <th style={{ ...cell, fontWeight: 600, color: "var(--color-text-muted, #6b7280)" }}>User</th>
              <th style={{ ...cell, fontWeight: 600, color: "var(--color-text-muted, #6b7280)" }}>Studio</th>
              <th style={{ ...cell, fontWeight: 600, color: "var(--color-text-muted, #6b7280)" }}>Joined</th>
              <th style={{ ...cell, fontWeight: 600, color: "var(--color-text-muted, #6b7280)" }}>Onboarded</th>
              <th style={{ ...cell, fontWeight: 600, color: "var(--color-text-muted, #6b7280)", textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isMe = r.id === currentAdminId;
              return (
                <tr key={r.id}>
                  <td style={cell}>
                    <div style={{ fontWeight: 500 }}>{r.displayName || "—"}</div>
                    <div style={{ color: "var(--color-text-muted, #6b7280)", fontSize: 12 }}>{r.email}</div>
                  </td>
                  <td style={cell}>{r.studioName || "—"}</td>
                  <td style={cell}>{fmtDate(r.createdAt)}</td>
                  <td style={cell}>{r.onboarded ? "Yes" : "No"}</td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    {isMe ? (
                      <span style={{ fontSize: 12, color: "var(--color-text-muted, #9ca3af)" }}>you</span>
                    ) : (
                      <button
                        onClick={() => viewAs(r.id)}
                        disabled={loadingId === r.id}
                        style={{
                          fontSize: 12,
                          padding: "5px 10px",
                          borderRadius: 7,
                          border: "1px solid var(--color-border, #d1d5db)",
                          background: "var(--color-surface, #fff)",
                          cursor: loadingId === r.id ? "default" : "pointer",
                          opacity: loadingId === r.id ? 0.6 : 1,
                        }}
                      >
                        {loadingId === r.id ? "…" : "View as"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {active && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1000,
          }}
          onClick={() => setActive(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-surface, #fff)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>View as {active.email}</h2>
            <p style={{ fontSize: 13, color: "var(--color-text-muted, #6b7280)", lineHeight: 1.5, marginBottom: 14 }}>
              Open this link in a <strong>private / incognito window</strong> so it doesn&apos;t replace your own admin
              session. It signs you in as this user (real session, ~1&nbsp;hour) so you see exactly what they see.
            </p>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                wordBreak: "break-all",
                background: "var(--color-surface-muted, #f3f4f6)",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 14,
                maxHeight: 90,
                overflow: "auto",
              }}
            >
              {active.url}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setActive(null)}
                style={{ fontSize: 13, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--color-border, #d1d5db)", background: "transparent", cursor: "pointer" }}
              >
                Close
              </button>
              <button
                onClick={copy}
                style={{ fontSize: 13, padding: "7px 12px", borderRadius: 8, border: "none", background: "var(--color-accent, #111827)", color: "#fff", cursor: "pointer" }}
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
