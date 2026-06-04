"use client";

// Connect / configure conferencing apps used by scheduling links. Google Meet
// and Teams ride on the connected calendar accounts (shown as status); Zoom is
// a saved personal meeting link the booking flow attaches for Zoom links.

import { useEffect, useState } from "react";
import { X, Video, Check } from "lucide-react";

interface Props { onClose: () => void; }

export default function ManageConferencingModal({ onClose }: Props) {
  const [zoom, setZoom] = useState("");
  const [google, setGoogle] = useState(false);
  const [teams, setTeams] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/scheduling/conferencing").then((r) => r.json()).then((d) => {
      setZoom(d.zoom_url ?? "");
      setGoogle(!!d.google_connected);
      setTeams(!!d.teams_connected);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setSaved(false);
    await fetch("/api/scheduling/conferencing", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zoom_url: zoom }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#eceae3] px-6 py-4">
          <h2 className="text-base font-semibold text-[#1f211a]">Manage conferencing</h2>
          <button onClick={onClose} className="text-[#9a9690] hover:text-[#4a4842]"><X size={18} /></button>
        </div>

        <div className="space-y-3 px-6 py-5">
          {loading ? (
            <p className="text-sm text-[#9a9690]">Loading…</p>
          ) : (
            <>
              <Provider name="Google Meet" connected={google} hint={google ? "Connected via Google Calendar" : "Connect a Google account in Integrations"} />
              <Provider name="Microsoft Teams" connected={teams} hint={teams ? "Connected via Outlook" : "Connect an Outlook account in Integrations"} />

              <div className="rounded-xl border border-[#eceae3] p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "#2D8CFF1a", color: "#2D8CFF" }}><Video size={16} /></span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#1f211a]">Zoom</p>
                    <p className="text-xs text-[#9a9690]">Paste your personal meeting link</p>
                  </div>
                </div>
                <input
                  value={zoom}
                  onChange={(e) => setZoom(e.target.value)}
                  placeholder="https://zoom.us/j/your-personal-room"
                  className="mt-2.5 w-full rounded-lg border border-[#e4e2db] px-3 py-2 text-sm text-[#1f211a] outline-none focus:border-[#4a5842]"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#eceae3] px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[#4a4842] hover:bg-[#f0eee8]">Close</button>
          <button onClick={save} disabled={saving || loading} className="flex items-center gap-1.5 rounded-lg bg-[#4a5842] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saved ? <><Check size={14} /> Saved</> : saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Provider({ name, connected, hint }: { name: string; connected: boolean; hint: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[#eceae3] p-3.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: connected ? "#4a58421a" : "#f0eee8", color: connected ? "#4a5842" : "#b8b4ac" }}><Video size={16} /></span>
      <div className="flex-1">
        <p className="text-sm font-medium text-[#1f211a]">{name}</p>
        <p className="text-xs text-[#9a9690]">{hint}</p>
      </div>
      {connected
        ? <span className="flex items-center gap-1 text-xs font-medium text-[#4a5842]"><Check size={13} /> Ready</span>
        : <span className="text-xs text-[#b8b4ac]">Not connected</span>}
    </div>
  );
}
