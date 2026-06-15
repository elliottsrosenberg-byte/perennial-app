"use client";

import { useRef, useState } from "react";
import { X, Paperclip, MessageSquare } from "lucide-react";

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [files,   setFiles]   = useState<File[]>([]);
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setMessage(""); setFiles([]); setBusy(false); setDone(false); setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function close() { reset(); onClose(); }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!message.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("message", message);
      fd.append("page", window.location.pathname);
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/feedback", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Couldn't send feedback.");
      }
      setDone(true);
      setTimeout(close, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        onClick={close}
        style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(20,18,16,0.45)", backdropFilter: "blur(3px)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", zIndex: 121,
          top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "min(460px, calc(100vw - 32px))",
          background: "var(--color-surface-raised)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 14, boxShadow: "var(--shadow-overlay)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "0.5px solid var(--color-border)" }}>
          <MessageSquare size={15} strokeWidth={1.75} style={{ color: "var(--color-sage)" }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--color-charcoal)" }}>Share feedback</span>
          <button
            onClick={close}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-grey)", display: "flex", padding: 2 }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {done ? (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 4 }}>Thanks for the feedback ✦</p>
            <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}>We read every note.</p>
          </div>
        ) : (
          <>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                autoFocus
                rows={6}
                placeholder="What's working, what's not, ideas, bugs — anything."
                style={{
                  width: "100%", resize: "vertical", minHeight: 120,
                  fontSize: 13, lineHeight: 1.55, fontFamily: "inherit",
                  padding: "10px 12px", borderRadius: 9, outline: "none",
                  background: "var(--color-off-white)",
                  border: "0.5px solid var(--color-border)",
                  color: "var(--color-charcoal)",
                }}
              />

              {/* Attachments */}
              {files.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 9px",
                        borderRadius: 7, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)",
                      }}
                    >
                      <Paperclip size={12} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span style={{ fontSize: 10.5, color: "var(--color-grey)", flexShrink: 0 }}>{fmtSize(f.size)}</span>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label={`Remove ${f.name}`}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-grey)", display: "flex", padding: 0, flexShrink: 0 }}
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", fontSize: 11.5, fontWeight: 500, borderRadius: 7,
                  background: "transparent", border: "0.5px solid var(--color-border)",
                  color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Paperclip size={12} strokeWidth={1.75} />
                Attach files
              </button>

              {error && <p style={{ fontSize: 11.5, color: "var(--color-red-orange)" }}>{error}</p>}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "0.5px solid var(--color-border)" }}>
              <button
                onClick={close}
                disabled={busy}
                style={{
                  padding: "7px 14px", fontSize: 12, fontWeight: 500, borderRadius: 8,
                  background: "transparent", border: "0.5px solid var(--color-border)",
                  color: "var(--color-text-secondary)", cursor: busy ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || !message.trim()}
                style={{
                  padding: "7px 16px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none",
                  background: busy || !message.trim() ? "var(--color-surface-sunken)" : "var(--color-sage)",
                  color: busy || !message.trim() ? "var(--color-grey)" : "white",
                  cursor: busy || !message.trim() ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                {busy ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
