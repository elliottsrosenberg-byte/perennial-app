"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Section = "account" | "studio" | "preferences" | "notifications" | "billing" | "integrations";

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

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
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

function SaveBar({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return (
    <div
      className="flex items-center justify-end gap-3 mt-8 pt-5"
      style={{ borderTop: "0.5px solid var(--color-border)" }}
    >
      <button
        onClick={onSave}
        className="px-4 py-2 text-[12px] font-medium rounded-lg transition-all"
        style={{
          background: saved ? "rgba(141,208,71,0.12)" : "var(--color-charcoal)",
          color:      saved ? "#3d6b4f"               : "var(--color-warm-white)",
          border:     saved ? "0.5px solid rgba(141,208,71,0.25)" : "none",
        }}
      >
        {saved ? "Saved ✓" : "Save changes"}
      </button>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("account");
  const [saved,  setSaved]  = useState(false);

  // Account
  const [displayName, setDisplayName] = useState("");

  // Studio
  const [studioName,    setStudioName]    = useState("");
  const [tagline,       setTagline]       = useState("");
  const [location,      setLocation]      = useState("");
  const [website,       setWebsite]       = useState("");
  const [practiceTypes, setPracticeTypes] = useState<string[]>([]);
  const PRACTICE_OPTIONS = [
    "Furniture", "Objects & lighting", "Ceramics & glass", "Textiles",
    "Jewelry", "Painting", "Sculpture", "Printmaking", "Client-based work",
  ];

  // Preferences
  const [currency,     setCurrency]     = useState("USD");
  const [fiscalYear,   setFiscalYear]   = useState("January");
  const [dateFormat,   setDateFormat]   = useState("MM/DD/YYYY");
  const [weekStart,    setWeekStart]    = useState("Monday");
  const [hourlyRate,   setHourlyRate]   = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");

  // Notifications
  const [emailNotifs,    setEmailNotifs]    = useState(true);
  const [notifDeadlines, setNotifDeadlines] = useState(true);
  const [notifInvoiceDue, setNotifInvoiceDue] = useState(true);
  const [notifOverdue,   setNotifOverdue]   = useState(true);
  const [notifWeekly,    setNotifWeekly]    = useState(false);
  const [notifMonthly,   setNotifMonthly]   = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function togglePracticeType(type: string) {
    setPracticeTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
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

                {/* Avatar row */}
                <div className="flex items-center gap-4 mb-5">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-semibold shrink-0"
                    style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "#6b6860" }}
                  >
                    {displayName ? displayName.slice(0, 2).toUpperCase() : "—"}
                  </div>
                  <div>
                    <button
                      className="text-[12px] font-medium transition-colors hover:underline"
                      style={{ color: "#2563ab" }}
                    >
                      Upload photo
                    </button>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--color-grey)" }}>
                      JPG or PNG, up to 2 MB
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <FieldLabel>Display name</FieldLabel>
                    <TextInput
                      value={displayName}
                      onChange={setDisplayName}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <FieldLabel>Email address</FieldLabel>
                    <TextInput value="" placeholder="your@email.com" disabled />
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
                      <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                        Last changed — never
                      </p>
                    </div>
                    <button
                      className="px-3 py-[6px] text-[11px] font-medium rounded-lg transition-colors"
                      style={{ border: "0.5px solid var(--color-border)", color: "#6b6860", background: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      Change password
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>Two-factor authentication</p>
                      <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                        Not enabled
                      </p>
                    </div>
                    <button
                      className="px-3 py-[6px] text-[11px] font-medium rounded-lg transition-colors"
                      style={{ border: "0.5px solid var(--color-border)", color: "#6b6860", background: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      Enable
                    </button>
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
                  >
                    Delete account
                  </button>
                </div>

                <SaveBar saved={saved} onSave={handleSave} />
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
                      value={studioName}
                      onChange={setStudioName}
                      placeholder="e.g. Atelier Rosenberg"
                    />
                  </div>
                  <div>
                    <FieldLabel>Tagline or bio</FieldLabel>
                    <TextArea
                      value={tagline}
                      onChange={setTagline}
                      placeholder="A short description of your practice…"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>City</FieldLabel>
                      <TextInput value={location} onChange={setLocation} placeholder="e.g. New York, NY" />
                    </div>
                    <div>
                      <FieldLabel>Website</FieldLabel>
                      <TextInput value={website} onChange={setWebsite} placeholder="https://" type="url" />
                    </div>
                  </div>
                </div>

                <Divider />
                <GroupTitle>Practice type</GroupTitle>

                <p className="text-[11px] mb-4" style={{ color: "var(--color-grey)" }}>
                  Select all that apply. Ash uses this to tailor advice and context.
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRACTICE_OPTIONS.map((type) => {
                    const isSelected = practiceTypes.includes(type);
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

                <SaveBar saved={saved} onSave={handleSave} />
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
                      value={currency}
                      onChange={setCurrency}
                      options={[
                        { value: "USD", label: "USD — US Dollar"      },
                        { value: "EUR", label: "EUR — Euro"           },
                        { value: "GBP", label: "GBP — British Pound"  },
                        { value: "CAD", label: "CAD — Canadian Dollar" },
                        { value: "AUD", label: "AUD — Australian Dollar" },
                        { value: "CHF", label: "CHF — Swiss Franc"    },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel>Fiscal year start</FieldLabel>
                    <SelectInput
                      value={fiscalYear}
                      onChange={setFiscalYear}
                      options={["January","February","March","April","May","June","July","August","September","October","November","December"].map((m) => ({ value: m, label: m }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Date format</FieldLabel>
                    <SelectInput
                      value={dateFormat}
                      onChange={setDateFormat}
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
                      value={weekStart}
                      onChange={setWeekStart}
                      options={[
                        { value: "Monday",  label: "Monday"  },
                        { value: "Sunday",  label: "Sunday"  },
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
                      <span
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]"
                        style={{ color: "var(--color-grey)" }}
                      >
                        {currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$"}
                      </span>
                      <input
                        type="number"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
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
                        value={invoicePrefix}
                        onChange={setInvoicePrefix}
                        placeholder="INV-"
                      />
                    </div>
                    <div>
                      <FieldLabel>Default payment terms</FieldLabel>
                      <SelectInput
                        value={paymentTerms}
                        onChange={setPaymentTerms}
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

                <SaveBar saved={saved} onSave={handleSave} />
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

                {/* Master toggle */}
                <div
                  className="flex items-center justify-between p-4 rounded-xl mb-4"
                  style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                >
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>
                      Receive email notifications
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                      {emailNotifs ? "Emails are enabled." : "All email notifications are paused."}
                    </p>
                  </div>
                  <Toggle checked={emailNotifs} onChange={() => setEmailNotifs((v) => !v)} />
                </div>

                <div className="space-y-3" style={{ opacity: emailNotifs ? 1 : 0.45, pointerEvents: emailNotifs ? "auto" : "none" }}>
                  {[
                    { label: "Project deadline reminders",  sub: "3 days before a project due date",        checked: notifDeadlines,  toggle: () => setNotifDeadlines((v) => !v)  },
                    { label: "Invoice due date reminders",  sub: "3 days before an invoice becomes due",     checked: notifInvoiceDue, toggle: () => setNotifInvoiceDue((v) => !v) },
                    { label: "Overdue invoice alerts",      sub: "When an invoice passes its due date",      checked: notifOverdue,    toggle: () => setNotifOverdue((v) => !v)    },
                    { label: "Weekly summary",              sub: "Every Monday — projects, finances, todos", checked: notifWeekly,     toggle: () => setNotifWeekly((v) => !v)     },
                    { label: "Monthly finance summary",     sub: "First of each month — billing overview",   checked: notifMonthly,    toggle: () => setNotifMonthly((v) => !v)    },
                  ].map(({ label, sub, checked, toggle }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between py-3 px-4 rounded-lg"
                      style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                    >
                      <div>
                        <p className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>{label}</p>
                        <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>{sub}</p>
                      </div>
                      <Toggle checked={checked} onChange={toggle} />
                    </div>
                  ))}
                </div>

                <Divider />
                <GroupTitle>In-app</GroupTitle>
                <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>
                  In-app push notifications are coming in a future update.
                </p>

                <SaveBar saved={saved} onSave={handleSave} />
              </>
            )}

            {/* ── Billing ── */}
            {active === "billing" && (
              <>
                <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>Billing</h2>
                <p className="text-[12px] mb-7" style={{ color: "var(--color-grey)" }}>
                  Your current plan and usage.
                </p>

                {/* Plan card */}
                <div
                  className="rounded-2xl p-6 mb-6"
                  style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[18px] font-bold"
                          style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}
                        >
                          Free Beta
                        </span>
                        <span
                          className="text-[10px] font-semibold px-2 py-[3px] rounded-full"
                          style={{ background: "rgba(141,208,71,0.15)", color: "#3d6b4f" }}
                        >
                          Active
                        </span>
                      </div>
                      <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>
                        You&apos;re on the beta plan. Billing begins when Perennial launches publicly.
                      </p>
                    </div>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "rgba(155,163,122,0.15)" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
                        <path d="M14 22V12" stroke="#9BA37A" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M14 16C14 16 11 14 10 11C12 11 14 12.5 14 16Z" fill="#9BA37A"/>
                        <path d="M14 14C14 14 17 12 18 9C16 9 14 10.5 14 14Z" fill="#9BA37A"/>
                      </svg>
                    </div>
                  </div>

                  <div
                    className="rounded-xl p-4"
                    style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-grey)" }}>
                      Included in beta
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        "All core modules",
                        "Unlimited projects & contacts",
                        "Finance & invoicing",
                        "Ash AI assistant",
                        "Notes with rich text",
                        "Resources vault",
                        "Priority support",
                        "Direct feedback to the team",
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

                <div
                  className="flex items-center gap-3 p-4 rounded-xl"
                  style={{ background: "rgba(155,163,122,0.07)", border: "0.5px solid rgba(155,163,122,0.2)" }}
                >
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
                  Connect the tools you already use. More coming soon.
                </p>

                <div className="space-y-3">
                  {[
                    {
                      name: "Google Calendar",
                      desc: "Sync project deadlines and reminders with your Google Calendar.",
                      icon: "🗓",
                      iconBg: "rgba(37,99,171,0.10)",
                    },
                    {
                      name: "Stripe",
                      desc: "Accept payments and mark invoices paid automatically.",
                      icon: "💳",
                      iconBg: "rgba(109,79,163,0.10)",
                    },
                    {
                      name: "QuickBooks Online",
                      desc: "Sync invoices and expenses with your accounting software.",
                      icon: "📊",
                      iconBg: "rgba(20,140,140,0.10)",
                    },
                    {
                      name: "Dropbox",
                      desc: "Attach files and assets from your Dropbox to projects and resources.",
                      icon: "📦",
                      iconBg: "rgba(37,99,171,0.08)",
                    },
                    {
                      name: "Mailchimp",
                      desc: "Connect your newsletter and track subscribers from Presence.",
                      icon: "✉️",
                      iconBg: "rgba(232,197,71,0.12)",
                    },
                  ].map(({ name, desc, icon, iconBg }) => (
                    <div
                      key={name}
                      className="flex items-center gap-4 p-4 rounded-xl"
                      style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] shrink-0"
                        style={{ background: iconBg }}
                      >
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-charcoal)" }}>{name}</p>
                        <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>{desc}</p>
                      </div>
                      <span
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                        style={{ background: "var(--color-cream)", color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                      >
                        Coming soon
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
