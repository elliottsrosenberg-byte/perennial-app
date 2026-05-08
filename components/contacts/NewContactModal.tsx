"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactStatus, LeadStage } from "@/types/database";
import { X } from "lucide-react";

interface Props {
  onClose:   () => void;
  onCreated: (contact: Contact) => void;
  isLead?:   boolean;
}

const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: "active",        label: "Active"        },
  { value: "inactive",      label: "Inactive"      },
  { value: "former_client", label: "Former client" },
];

const LEAD_STAGE_OPTIONS: { value: LeadStage; label: string }[] = [
  { value: "new",             label: "New"            },
  { value: "reached_out",     label: "Reached out"    },
  { value: "in_conversation", label: "In conversation" },
  { value: "proposal_sent",   label: "Proposal sent"  },
  { value: "qualified",       label: "Qualified"      },
  { value: "nurturing",       label: "Nurturing"      },
  { value: "lost",            label: "Lost"           },
];

const PRESET_TAGS = ["Gallery", "Client", "Supplier", "Press", "Lead", "Event"];

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = {
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  color: "var(--color-charcoal)",
};
const labelCls = "block text-[11px] font-medium mb-1";

export default function NewContactModal({ onClose, onCreated, isLead = false }: Props) {
  const [type,      setType]      = useState<"contact" | "lead">(isLead ? "lead" : "contact");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [company, setCompany]     = useState("");
  const [title, setTitle]         = useState("");
  const [location, setLocation]   = useState("");
  const [website, setWebsite]     = useState("");
  const [status,    setStatus]    = useState<ContactStatus>("active");
  const [leadStage, setLeadStage] = useState<LeadStage>("new");
  const [tags, setTags]           = useState<string[]>([]);
  const [tagInput, setTagInput]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const tagRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) { setTagInput(""); return; }
    setTags((prev) => [...prev, tag]);
    setTagInput("");
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
    if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    let company_id: string | null = null;

    if (company.trim()) {
      // Look up or create company
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .ilike("name", company.trim())
        .maybeSingle();

      if (existing) {
        company_id = existing.id;
      } else {
        const { data: created } = await supabase
          .from("companies")
          .insert({ user_id: user.id, name: company.trim() })
          .select("id")
          .single();
        company_id = created?.id ?? null;
      }
    }

    const payload = {
      user_id:     user.id,
      first_name:  firstName.trim(),
      last_name:   lastName.trim(),
      email:       email.trim()    || null,
      phone:       phone.trim()    || null,
      company_id,
      title:       title.trim()    || null,
      location:    location.trim() || null,
      website:     website.trim()  || null,
      tags,
      status:      type === "contact" ? status : "active",
      is_lead:     type === "lead",
      lead_stage:  type === "lead" ? leadStage : null,
    };

    const { data, error: dbError } = await supabase
      .from("contacts")
      .insert(payload)
      .select("*, company:companies(*)")
      .single();

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
    } else {
      onCreated(data as Contact);
      onClose();
    }
  }

  const suggestedTags = PRESET_TAGS.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          {/* Type toggle */}
          <div style={{ display: "flex", gap: 2, background: "var(--color-cream)", borderRadius: 8, padding: 2 }}>
            {(["contact", "lead"] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                style={{ padding: "4px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", fontFamily: "inherit", background: type === t ? (t === "contact" ? "var(--color-sage)" : "#b8860b") : "transparent", color: type === t ? "white" : "#9a9690", transition: "all 0.1s ease" }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[68vh] overflow-y-auto">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>First name *</label>
              <input
                type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                required placeholder="Sarah" autoFocus className={inputCls} style={inputStyle}
              />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Last name *</label>
              <input
                type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                required placeholder="Okonkwo" className={inputCls} style={inputStyle}
              />
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@gallery.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 212 555 0100" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Company + Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Company</label>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                placeholder="The Parlour Gallery" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Title / Role</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Gallery Director" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Status / Stage + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {type === "contact" ? (
                <>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)}
                    className={inputCls} style={inputStyle}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Lead stage</label>
                  <select value={leadStage} onChange={(e) => setLeadStage(e.target.value as LeadStage)}
                    className={inputCls} style={inputStyle}>
                    {LEAD_STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </>
              )}
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Location</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="New York, NY" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Website</label>
            <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)}
              placeholder="theparlourgallery.com" className={inputCls} style={inputStyle} />
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Tags</label>
            <div
              className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg min-h-[38px] cursor-text"
              style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}
              onClick={() => tagRef.current?.focus()}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: "var(--color-cream)", color: "var(--color-charcoal)" }}
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="opacity-50 hover:opacity-100">
                    <X size={9} />
                  </button>
                </span>
              ))}
              <input
                ref={tagRef}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                placeholder={tags.length === 0 ? "Add tags…" : ""}
                className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-[13px]"
                style={{ color: "var(--color-charcoal)" }}
              />
            </div>
            {/* Suggestions */}
            {tagInput === "" && suggestedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggestedTags.map((t) => (
                  <button
                    key={t} type="button" onClick={() => addTag(t)}
                    className="px-2 py-0.5 rounded-full text-[11px] transition-colors"
                    style={{ background: "var(--color-cream)", color: "#6b6860", border: "0.5px solid var(--color-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-sage)", e.currentTarget.style.color = "white")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-cream)", e.currentTarget.style.color = "#6b6860")}
                  >
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: "0.5px solid var(--color-border)" }}
        >
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
            disabled={loading || !firstName.trim() || !lastName.trim()}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-sage)" }}
          >
            {loading ? "Creating…" : "Create contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
