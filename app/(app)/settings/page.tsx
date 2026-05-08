"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/layout/Topbar";
import { createClient } from "@/lib/supabase/client";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Section = "account" | "studio" | "preferences" | "notifications" | "billing" | "integrations";

interface Profile {
  display_name:         string | null;
  studio_name:          string | null;
  tagline:              string | null;
  location:             string | null;
  website:              string | null;
  practice_types:       string[];
  currency:             string;
  fiscal_year:          string;
  date_format:          string;
  week_start:           string;
  hourly_rate:          number | null;
  invoice_prefix:       string;
  payment_terms:        string;
  notif_email_enabled:  boolean;
  notif_deadlines:      boolean;
  notif_invoice_due:    boolean;
  notif_overdue:        boolean;
  notif_weekly:         boolean;
  notif_monthly:        boolean;
}

interface IntegrationRow {
  id:             string;
  provider:       string;
  account_name:   string | null;
  connected_at:   string;
  last_synced_at: string | null;
}

const DEFAULT_PROFILE: Profile = {
  display_name: "", studio_name: "", tagline: "", location: "", website: "",
  practice_types: [], currency: "USD", fiscal_year: "January",
  date_format: "MM/DD/YYYY", week_start: "Monday", hourly_rate: null,
  invoice_prefix: "INV-", payment_terms: "Net 30",
  notif_email_enabled: true, notif_deadlines: true, notif_invoice_due: true,
  notif_overdue: true, notif_weekly: false, notif_monthly: false,
};

const PRACTICE_OPTIONS = [
  "Furniture", "Objects & lighting", "Ceramics & glass", "Textiles",
  "Jewelry", "Painting", "Sculpture", "Printmaking", "Client-based work",
];

// ─── Sub-components ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide mb-[6px]" style={{ color: "var(--color-grey)" }}>
      {children}
    </p>
  );
}

function TextInput({
  value, onChange, placeholder, type = "text", disabled = false,
}: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-[7px] text-[12px] rounded-lg transition-colors"
      style={{
        background:  disabled ? "var(--color-cream)" : "var(--color-warm-white)",
        border:      "0.5px solid var(--color-border)",
        color:       disabled ? "var(--color-grey)" : "var(--color-charcoal)",
        fontFamily:  "inherit",
        outline:     "none",
      }}
      onFocus={(e) => { if (!disabled) e.target.style.borderColor = "var(--color-sage)"; }}
      onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; }}
    />
  );
}

function TextArea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-[7px] text-[12px] rounded-lg transition-colors resize-none"
      style={{
        background: "var(--color-warm-white)",
        border:     "0.5px solid var(--color-border)",
        color:      "var(--color-charcoal)",
        fontFamily: "inherit",
        outline:    "none",
      }}
      onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; }}
      onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; }}
    />
  );
}

function SelectInput({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-[7px] text-[12px] rounded-lg appearance-none cursor-pointer pr-8"
        style={{
          background: "var(--color-warm-white)",
          border:     "0.5px solid var(--color-border)",
          color:      "var(--color-charcoal)",
          fontFamily: "inherit",
          outline:    "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        width="10" height="10" viewBox="0 0 16 16" fill="none"
        stroke="var(--color-grey)" strokeWidth="2"
      >
        <path d="M4 6l4 4 4-4"/>
      </svg>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative rounded-full transition-colors shrink-0"
      style={{ width: 36, height: 20, background: checked ? "var(--color-sage)" : "rgba(31,33,26,0.15)" }}
    >
      <span
        className="absolute top-[2px] w-4 h-4 bg-white rounded-full shadow-sm transition-all"
        style={{ left: checked ? "calc(100% - 18px)" : "2px" }}
      />
    </button>
  );
}

function Divider() {
  return <div style={{ height: "0.5px", background: "var(--color-border)", margin: "24px 0" }} />;
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-semibold uppercase tracking-wider mb-4 pb-2"
      style={{ color: "var(--color-grey)", borderBottom: "0.5px solid var(--color-border)" }}
    >
      {children}
    </p>
  );
}

function SaveBar({ saving, saved, onSave }: { saving: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div
      className="flex items-center justify-end gap-3 mt-8 pt-5"
      style={{ borderTop: "0.5px solid var(--color-border)" }}
    >
      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 text-[12px] font-medium rounded-lg transition-all"
        style={{
          background: saved ? "rgba(141,208,71,0.12)" : "var(--color-charcoal)",
          color:      saved ? "#3d6b4f"               : "var(--color-warm-white)",
          border:     saved ? "0.5px solid rgba(141,208,71,0.25)" : "none",
          opacity:    saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
      </button>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active,  setActive]  = useState<Section>("account");
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [userId,  setUserId]  = useState<string | null>(null);
  const [email,   setEmail]   = useState<string>("");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);

  // Load profile + integrations on mount
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email ?? "");

      const [{ data: prof }, { data: intgs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("integrations").select("id, provider, account_name, connected_at, last_synced_at").eq("user_id", user.id),
      ]);

      if (prof) {
        setProfile({
          display_name:        prof.display_name ?? "",
          studio_name:         prof.studio_name ?? "",
          tagline:             prof.tagline ?? "",
          location:            prof.location ?? "",
          website:             prof.website ?? "",
          practice_types:      prof.practice_types ?? [],
          currency:            prof.currency ?? "USD",
          fiscal_year:         prof.fiscal_year ?? "January",
          date_format:         prof.date_format ?? "MM/DD/YYYY",
          week_start:          prof.week_start ?? "Monday",
          hourly_rate:         prof.hourly_rate ?? null,
          invoice_prefix:      prof.invoice_prefix ?? "INV-",
          payment_terms:       prof.payment_terms ?? "Net 30",
          notif_email_enabled: prof.notif_email_enabled ?? true,
          notif_deadlines:     prof.notif_deadlines ?? true,
          notif_invoice_due:   prof.notif_invoice_due ?? true,
          notif_overdue:       prof.notif_overdue ?? true,
          notif_weekly:        prof.notif_weekly ?? false,
          notif_monthly:       prof.notif_monthly ?? false,
        });
      }
      if (intgs) setIntegrations(intgs as IntegrationRow[]);
      setLoading(false);
    }
    load();
  }, []);

  function set<K extends keyof Profile>(key: K, val: Profile[K]) {
    setProfile((p) => ({ ...p, [key]: val }));
  }

  function togglePracticeType(type: string) {
    set("practice_types", profile.practice_types.includes(type)
      ? profile.practice_types.filter((t) => t !== type)
      : [...profile.practice_types, type]);
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id:              userId,
        display_name:         profile.display_name || null,
        studio_name:          profile.studio_name || null,
        tagline:              profile.tagline || null,
        location:             profile.location || null,
        website:              profile.website || null,
        practice_types:       profile.practice_types,
        currency:             profile.currency,
        fiscal_year:          profile.fiscal_year,
        date_format:          profile.date_format,
        week_start:           profile.week_start,
        hourly_rate:          profile.hourly_rate,
        invoice_prefix:       profile.invoice_prefix,
        payment_terms:        profile.payment_terms,
        notif_email_enabled:  profile.notif_email_enabled,
        notif_deadlines:      profile.notif_deadlines,
        notif_invoice_due:    profile.notif_invoice_due,
        notif_overdue:        profile.notif_overdue,
        notif_weekly:         profile.notif_weekly,
        notif_monthly:        profile.notif_monthly,
        updated_at:           new Date().toISOString(),
      });

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Broadcast profile update so Sidebar picks it up
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: { studio_name: profile.studio_name } }));
    }
  }

  const NAV: { id: Section; label: string; group?: "admin" }[] = [
    { id: "account",       label: "Account"       },
    { id: "studio",        label: "Studio"        },
    { id: "preferences",   label: "Preferences"   },
    { id: "notifications", label: "Notifications" },
    { id: "billing",       label: "Billing",        group: "admin" },
    { id: "integrations",  label: "Integrations",   group: "admin" },
  ];

  function NavItem({ id, label }: { id: Section; label: string }) {
    const isActive = active === id;
    return (
      <button
        onClick={() => setActive(id)}
        className="w-full text-left px-4 py-[8px] text-[13px] transition-colors"
        style={{
          background:  isActive ? "var(--color-cream)" : "transparent",
          color:       isActive ? "var(--color-charcoal)" : "#6b6860",
          fontWeight:  isActive ? 500 : 400,
          borderLeft:  `2px solid ${isActive ? "var(--color-charcoal)" : "transparent"}`,
        }}
      >
        {label}
      </button>
    );
  }

  const currencySymbol = profile.currency === "EUR" ? "€" : profile.currency === "GBP" ? "£" : "$";
  const initials = (profile.display_name || email).slice(0, 2).toUpperCase() || "—";

  // Connected integrations lookup
  function getIntegration(provider: string) {
    return integrations.find((i) => i.provider === provider) ?? null;
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Topbar title="Settings" />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Settings" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left nav ── */}
        <nav
          className="flex flex-col py-4 shrink-0 overflow-y-auto"
          style={{ width: 200, borderRight: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}
        >
          <p className="px-4 mb-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>
            Your account
          </p>
          {NAV.filter((s) => !s.group).map((s) => (
            <NavItem key={s.id} id={s.id} label={s.label} />
          ))}

          <div className="mx-4 my-3" style={{ height: "0.5px", background: "var(--color-border)" }} />

          <p className="px-4 mb-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>
            Plan & tools
          </p>
          {NAV.filter((s) => s.group === "admin").map((s) => (
            <NavItem key={s.id} id={s.id} label={s.label} />
          ))}
        </nav>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--color-warm-white)" }}>
          <div style={{ maxWidth: 560, padding: "32px 40px" }}>

            {/* ── Account ── */}
            {active === "account" && (
              <>
                <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>Account</h2>
                <p className="text-[12px] mb-7" style={{ color: "var(--color-grey)" }}>
                  Your profile and security settings.
                </p>

                <GroupTitle>Profile</GroupTitle>

                <div className="flex items-center gap-4 mb-5">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-semibold shrink-0"
                    style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "#6b6860" }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>Profile photo</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--color-grey)" }}>
                      Photo upload coming in a future update.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <FieldLabel>Display name</FieldLabel>
                    <TextInput
                      value={profile.display_name ?? ""}
                      onChange={(v) => set("display_name", v)}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <FieldLabel>Email address</FieldLabel>
                    <TextInput value={email} placeholder="your@email.com" disabled />
                    <p className="mt-1 text-[10px]" style={{ color: "var(--color-grey)" }}>
                      Contact support to change your email address.
                    </p>
                  </div>
                </div>

                <Divider />
                <GroupTitle>Security</GroupTitle>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>Password</p>
                      <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>Reset via email link</p>
                    </div>
                    <button
                      className="px-3 py-[6px] text-[11px] font-medium rounded-lg transition-colors"
                      style={{ border: "0.5px solid var(--color-border)", color: "#6b6860", background: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      onClick={async () => {
                        const supabase = createClient();
                        await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
                        alert(`Password reset email sent to ${email}`);
                      }}
                    >
                      Send reset email
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>Two-factor authentication</p>
                      <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>Coming in a future update</p>
                    </div>
                    <span
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: "var(--color-cream)", color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                    >
                      Soon
                    </span>
                  </div>
                </div>

                <Divider />
                <GroupTitle>Danger zone</GroupTitle>

                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ border: "0.5px solid rgba(220,62,13,0.25)", background: "rgba(220,62,13,0.04)" }}
                >
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>Delete account</p>
                    <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                      Permanently delete your account and all data. Cannot be undone.
                    </p>
                  </div>
                  <button
                    className="px-3 py-[6px] text-[11px] font-medium rounded-lg shrink-0 ml-4 transition-colors"
                    style={{ border: "0.5px solid rgba(220,62,13,0.3)", color: "var(--color-red-orange)", background: "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,62,13,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={() => {
                      if (window.confirm("Are you absolutely sure? This will permanently delete your account and all data.")) {
                        alert("Please contact support at support@perennial.design to delete your account.");
                      }
                    }}
                  >
                    Delete account
                  </button>
                </div>

                <SaveBar saving={saving} saved={saved} onSave={handleSave} />
              </>
            )}

            {/* ── Studio ── */}
            {active === "studio" && (
              <>
                <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>Studio</h2>
                <p className="text-[12px] mb-7" style={{ color: "var(--color-grey)" }}>
                  Your practice identity. Used across Perennial and visible to Ash.
                </p>

                <GroupTitle>Identity</GroupTitle>
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Studio / practice name</FieldLabel>
                    <TextInput
                      value={profile.studio_name ?? ""}
                      onChange={(v) => set("studio_name", v)}
                      placeholder="e.g. Atelier Rosenberg"
                    />
                    <p className="mt-1 text-[10px]" style={{ color: "var(--color-grey)" }}>
                      Appears in the sidebar and on your invoices.
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Tagline or bio</FieldLabel>
                    <TextArea
                      value={profile.tagline ?? ""}
                      onChange={(v) => set("tagline", v)}
                      placeholder="A short description of your practice…"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>City</FieldLabel>
                      <TextInput value={profile.location ?? ""} onChange={(v) => set("location", v)} placeholder="e.g. New York, NY" />
                    </div>
                    <div>
                      <FieldLabel>Website</FieldLabel>
                      <TextInput value={profile.website ?? ""} onChange={(v) => set("website", v)} placeholder="https://" type="url" />
                    </div>
                  </div>
                </div>

                <Divider />
                <GroupTitle>Practice type</GroupTitle>

                <p className="text-[11px] mb-4" style={{ color: "var(--color-grey)" }}>
                  Select all that apply. Ash uses this to tailor advice and context to your specific practice.
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRACTICE_OPTIONS.map((type) => {
                    const isSelected = profile.practice_types.includes(type);
                    return (
                      <button
                        key={type}
                        onClick={() => togglePracticeType(type)}
                        className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
                        style={{
                          background: isSelected ? "var(--color-charcoal)" : "transparent",
                          color:      isSelected ? "var(--color-warm-white)" : "#6b6860",
                          border:     `0.5px solid ${isSelected ? "var(--color-charcoal)" : "var(--color-border)"}`,
                        }}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>

                <SaveBar saving={saving} saved={saved} onSave={handleSave} />
              </>
            )}

            {/* ── Preferences ── */}
            {active === "preferences" && (
              <>
                <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>Preferences</h2>
                <p className="text-[12px] mb-7" style={{ color: "var(--color-grey)" }}>
                  Localization and defaults for finance, dates, and time.
                </p>

                <GroupTitle>Localization</GroupTitle>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <FieldLabel>Currency</FieldLabel>
                    <SelectInput
                      value={profile.currency}
                      onChange={(v) => set("currency", v)}
                      options={[
                        { value: "USD", label: "USD — US Dollar"        },
                        { value: "EUR", label: "EUR — Euro"             },
                        { value: "GBP", label: "GBP — British Pound"    },
                        { value: "CAD", label: "CAD — Canadian Dollar"  },
                        { value: "AUD", label: "AUD — Australian Dollar" },
                        { value: "CHF", label: "CHF — Swiss Franc"      },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel>Fiscal year start</FieldLabel>
                    <SelectInput
                      value={profile.fiscal_year}
                      onChange={(v) => set("fiscal_year", v)}
                      options={["January","February","March","April","May","June","July","August","September","October","November","December"].map((m) => ({ value: m, label: m }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Date format</FieldLabel>
                    <SelectInput
                      value={profile.date_format}
                      onChange={(v) => set("date_format", v)}
                      options={[
                        { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
                        { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
                        { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel>Week starts on</FieldLabel>
                    <SelectInput
                      value={profile.week_start}
                      onChange={(v) => set("week_start", v)}
                      options={[
                        { value: "Monday", label: "Monday" },
                        { value: "Sunday", label: "Sunday" },
                      ]}
                    />
                  </div>
                </div>

                <Divider />
                <GroupTitle>Finance defaults</GroupTitle>

                <div className="space-y-4">
                  <div>
                    <FieldLabel>Default hourly rate</FieldLabel>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: "var(--color-grey)" }}>
                        {currencySymbol}
                      </span>
                      <input
                        type="number"
                        value={profile.hourly_rate ?? ""}
                        onChange={(e) => set("hourly_rate", e.target.value ? Number(e.target.value) : null)}
                        placeholder="0"
                        className="w-full pl-7 pr-3 py-[7px] text-[12px] rounded-lg"
                        style={{
                          background: "var(--color-warm-white)",
                          border: "0.5px solid var(--color-border)",
                          color: "var(--color-charcoal)",
                          fontFamily: "inherit",
                          outline: "none",
                        }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; }}
                        onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; }}
                      />
                    </div>
                    <p className="mt-1 text-[10px]" style={{ color: "var(--color-grey)" }}>
                      Applied to new projects by default. Override per project.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Invoice number prefix</FieldLabel>
                      <TextInput
                        value={profile.invoice_prefix}
                        onChange={(v) => set("invoice_prefix", v)}
                        placeholder="INV-"
                      />
                    </div>
                    <div>
                      <FieldLabel>Default payment terms</FieldLabel>
                      <SelectInput
                        value={profile.payment_terms}
                        onChange={(v) => set("payment_terms", v)}
                        options={[
                          { value: "Due on receipt", label: "Due on receipt" },
                          { value: "Net 7",  label: "Net 7"  },
                          { value: "Net 14", label: "Net 14" },
                          { value: "Net 30", label: "Net 30" },
                          { value: "Net 60", label: "Net 60" },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <SaveBar saving={saving} saved={saved} onSave={handleSave} />
              </>
            )}

            {/* ── Notifications ── */}
            {active === "notifications" && (
              <>
                <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>Notifications</h2>
                <p className="text-[12px] mb-7" style={{ color: "var(--color-grey)" }}>
                  Choose what Perennial notifies you about and how.
                </p>

                <GroupTitle>Email</GroupTitle>

                <div
                  className="flex items-center justify-between p-4 rounded-xl mb-4"
                  style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                >
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>
                      Receive email notifications
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                      {profile.notif_email_enabled ? `Sent to ${email}` : "All email notifications are paused."}
                    </p>
                  </div>
                  <ToggleSwitch checked={profile.notif_email_enabled} onChange={() => set("notif_email_enabled", !profile.notif_email_enabled)} />
                </div>

                <div className="space-y-3" style={{ opacity: profile.notif_email_enabled ? 1 : 0.45, pointerEvents: profile.notif_email_enabled ? "auto" : "none" }}>
                  {[
                    { label: "Project deadline reminders",  sub: "3 days before a project due date",        key: "notif_deadlines"   as const },
                    { label: "Invoice due date reminders",  sub: "3 days before an invoice becomes due",     key: "notif_invoice_due" as const },
                    { label: "Overdue invoice alerts",      sub: "When an invoice passes its due date",      key: "notif_overdue"     as const },
                    { label: "Weekly summary",              sub: "Every Monday — projects, finances, todos", key: "notif_weekly"      as const },
                    { label: "Monthly finance summary",     sub: "First of each month — billing overview",   key: "notif_monthly"     as const },
                  ].map(({ label, sub, key }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between py-3 px-4 rounded-lg"
                      style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                    >
                      <div>
                        <p className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>{label}</p>
                        <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>{sub}</p>
                      </div>
                      <ToggleSwitch checked={profile[key]} onChange={() => set(key, !profile[key])} />
                    </div>
                  ))}
                </div>

                <Divider />
                <GroupTitle>In-app</GroupTitle>
                <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>
                  In-app push notifications are coming in a future update.
                </p>

                <SaveBar saving={saving} saved={saved} onSave={handleSave} />
              </>
            )}

            {/* ── Billing ── */}
            {active === "billing" && (
              <>
                <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>Billing</h2>
                <p className="text-[12px] mb-7" style={{ color: "var(--color-grey)" }}>
                  Your current plan and usage.
                </p>

                <div
                  className="rounded-2xl p-6 mb-6"
                  style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[18px] font-bold" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>
                          Free Beta
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-[3px] rounded-full" style={{ background: "rgba(141,208,71,0.15)", color: "#3d6b4f" }}>
                          Active
                        </span>
                      </div>
                      <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>
                        You&apos;re on the beta plan. Billing begins when Perennial launches publicly.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl p-4" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-grey)" }}>
                      Included in beta
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        "All core modules", "Unlimited projects & contacts",
                        "Finance & invoicing", "Ash AI assistant",
                        "Notes with rich text", "Resources vault",
                        "Priority support", "Direct feedback to the team",
                      ].map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#3d6b4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 8l4 4 8-8"/>
                          </svg>
                          <span className="text-[11px]" style={{ color: "#6b6860" }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "rgba(155,163,122,0.07)", border: "0.5px solid rgba(155,163,122,0.2)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/>
                  </svg>
                  <p className="text-[11px]" style={{ color: "#6b6860" }}>
                    We&apos;ll notify you before billing begins. No credit card required during beta.
                  </p>
                </div>
              </>
            )}

            {/* ── Integrations ── */}
            {active === "integrations" && (
              <>
                <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>Integrations</h2>
                <p className="text-[12px] mb-7" style={{ color: "var(--color-grey)" }}>
                  Connect the tools you already use.
                </p>

                {/* Active integrations */}
                {integrations.length > 0 && (
                  <>
                    <GroupTitle>Connected</GroupTitle>
                    <div className="space-y-3 mb-6">
                      {integrations.map((intg) => (
                        <div
                          key={intg.id}
                          className="flex items-center gap-4 p-4 rounded-xl"
                          style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium capitalize" style={{ color: "var(--color-charcoal)" }}>
                              {intg.provider.replace(/_/g, " ")}
                            </p>
                            {intg.account_name && (
                              <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>{intg.account_name}</p>
                            )}
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-[3px] rounded-full" style={{ background: "rgba(141,208,71,0.15)", color: "#3d6b4f" }}>
                            Connected
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <GroupTitle>Available</GroupTitle>
                <div className="space-y-3">
                  {[
                    {
                      provider: "google_calendar",
                      name: "Google Calendar",
                      desc: "Sync project deadlines and reminders with your Google Calendar.",
                      icon: "🗓", iconBg: "rgba(37,99,171,0.10)",
                      href: "/api/auth/google-calendar",
                    },
                    {
                      provider: "instagram",
                      name: "Instagram",
                      desc: "View follower growth and engagement stats in Presence.",
                      icon: "📸", iconBg: "rgba(131,58,180,0.10)",
                      href: "/api/auth/instagram",
                    },
                    {
                      provider: "google_analytics",
                      name: "Google Analytics",
                      desc: "Track website traffic and top pages in the Presence module.",
                      icon: "📈", iconBg: "rgba(234,88,12,0.10)",
                      href: "/api/auth/google-analytics",
                    },
                    {
                      provider: "teller",
                      name: "Bank account",
                      desc: "Connect your bank to see transactions and cash flow in Finance.",
                      icon: "🏦", iconBg: "rgba(37,99,171,0.08)",
                      href: null,
                      note: "Connect from Finance → Banking",
                    },
                    {
                      provider: "stripe",
                      name: "Stripe",
                      desc: "Accept payments and mark invoices paid automatically.",
                      icon: "💳", iconBg: "rgba(109,79,163,0.10)",
                      soon: true,
                    },
                  ].map(({ provider, name, desc, icon, iconBg, href, note, soon }) => {
                    const connected = !!getIntegration(provider);
                    if (connected) return null;
                    return (
                      <div
                        key={provider}
                        className="flex items-center gap-4 p-4 rounded-xl"
                        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] shrink-0" style={{ background: iconBg }}>
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium" style={{ color: "var(--color-charcoal)" }}>{name}</p>
                          <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>{desc}</p>
                        </div>
                        {soon ? (
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--color-cream)", color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}>
                            Coming soon
                          </span>
                        ) : note ? (
                          <span className="text-[10px] shrink-0" style={{ color: "var(--color-grey)" }}>{note}</span>
                        ) : href ? (
                          <a
                            href={href}
                            className="px-3 py-[6px] text-[11px] font-medium rounded-lg shrink-0 transition-colors"
                            style={{ background: "var(--color-charcoal)", color: "var(--color-warm-white)", textDecoration: "none" }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                          >
                            Connect
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
