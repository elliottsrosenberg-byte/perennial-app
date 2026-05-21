"use client";

// Small "+ New organization" modal triggered from the Network/Organizations
// view. Orgs only need a name to be useful; website + location are optional
// nudges so the row in the list is immediately scannable. The detail panel
// is the right place for everything else (bio, tags, canvas, files), so we
// keep this lean — the caller opens the panel for the newly-created org
// right after onCreated fires.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Organization } from "@/types/database";
import { X } from "lucide-react";

interface Props {
  onClose:   () => void;
  onCreated: (org: Organization) => void;
}

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg transition-colors focus:outline-none";
const inputStyle = {
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  color: "var(--color-charcoal)",
};
const labelCls = "block text-[11px] font-medium mb-1";

export default function NewOrganizationModal({ onClose, onCreated }: Props) {
  const [name,     setName]     = useState("");
  const [website,  setWebsite]  = useState("");
  const [location, setLocation] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    const payload = {
      user_id:  user.id,
      name:     n,
      website:  website.trim()  || null,
      location: location.trim() || null,
    };

    const { data, error: dbError } = await supabase
      .from("organizations")
      .insert(payload)
      .select("*")
      .single();

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
    } else {
      onCreated(data as Organization);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
      >
        {/* Header */}
        <div style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-charcoal)" }}>
              New organization
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--color-grey)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <X size={14} />
            </button>
          </div>
          <p style={{ padding: "0 24px 12px", fontSize: 11, color: "var(--color-grey)", lineHeight: 1.5 }}>
            Galleries, brands, publications, fairs — anywhere multiple people work toward a shared programme. You can flesh out tags, bio, files, and link contacts from the detail panel.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Name *</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              required placeholder="The Parlour Gallery" autoFocus
              className={inputCls} style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Website</label>
              <input
                type="text" value={website} onChange={(e) => setWebsite(e.target.value)}
                placeholder="theparlourgallery.com" className={inputCls} style={inputStyle}
              />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Location</label>
              <input
                type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="London, UK" className={inputCls} style={inputStyle}
              />
            </div>
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg transition-colors"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !name.trim()}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-sage)" }}
          >
            {loading ? "Creating…" : "Create organization"}
          </button>
        </div>
      </div>
    </div>
  );
}
