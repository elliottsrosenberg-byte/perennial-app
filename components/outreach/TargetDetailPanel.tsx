"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachTarget, OutreachPipeline, PipelineStage, Project, Contact, Organization } from "@/types/database";
import {
  X, Maximize2, Minimize2, FileText, Trash2, Settings,
  CheckSquare, Users, FolderOpen, Plus, Link2,
  UserCheck, FolderPlus, Calendar, Building2, User,
} from "lucide-react";
import { useProjectOptions } from "@/lib/projects/options";
import Select from "@/components/ui/Select";
import DetailPanelShell from "@/components/ui/DetailPanelShell";
import SharedEditableField from "@/components/ui/EditableField";
import DatePillField from "@/components/ui/DatePillField";
import EntityTasksTab from "@/components/detail/EntityTasksTab";
import EntityNotesTab from "@/components/detail/EntityNotesTab";
import EntityFilesTab from "@/components/detail/EntityFilesTab";
import EntityActivityTab from "@/components/detail/EntityActivityTab";
import Canvas from "@/components/canvas/Canvas";
import AshPromptsModule, { type AshPrompt } from "@/components/ui/AshPromptsModule";
import { fmtDayRelative as fmtDate } from "@/lib/format/date";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function dateInputToISO(s: string): string | null {
  if (!s) return null;
  return new Date(`${s}T12:00:00`).toISOString();
}

// ── Canvas editor (unchanged from before) ─────────────────────────────────────

// The canvas is the wrapped entity's canvas — same workspace the user sees
// in the Network module. The target itself no longer owns canvas content;
// it's a pipeline-position record over a Contact or Organization.

// Orphan-target prompt — shown across the whole scrim when a target isn't yet
// linked to a Contact or Organization. A target is allowed to exist as a bare
// card on a pipeline; the moment you open it, this asks you to link an existing
// Network record OR create a new one. Once linked, the entity's canvas / tasks /
// notes / files / activity take over and the target is a thin pipeline-position
// wrapper over that record.
type OrphanLink = {
  contact_id?:      string | null;
  organization_id?: string | null;
  contact?:         Contact | null;
  organization?:    Organization | null;
};

function OrphanTargetPrompt({
  target, onLinked,
}: {
  target: OutreachTarget;
  onLinked: (next: OrphanLink) => void;
}) {
  const [busy, setBusy] = useState<"organization" | "person" | null>(null);
  const [linkKind, setLinkKind] = useState<"organization" | "person">("organization");
  const [query, setQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [orgResults,     setOrgResults]     = useState<Organization[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setContactResults([]); setOrgResults([]); return; }
    const handle = setTimeout(async () => {
      const supabase = createClient();
      if (linkKind === "person") {
        const { data } = await supabase.from("contacts")
          .select("*, organization:organizations(*)")
          .eq("archived", false)
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(6);
        setContactResults((data ?? []) as Contact[]); setOrgResults([]);
      } else {
        const { data } = await supabase.from("organizations")
          .select("*").eq("archived", false).ilike("name", `%${q}%`).limit(6);
        setOrgResults((data ?? []) as Organization[]); setContactResults([]);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query, linkKind]);

  async function linkContact(c: Contact) {
    await createClient().from("outreach_targets")
      .update({ contact_id: c.id, organization_id: null }).eq("id", target.id);
    onLinked({ contact_id: c.id, organization_id: null, contact: c, organization: null });
  }
  async function linkOrg(o: Organization) {
    await createClient().from("outreach_targets")
      .update({ organization_id: o.id, contact_id: null }).eq("id", target.id);
    onLinked({ organization_id: o.id, contact_id: null, organization: o, contact: null });
  }

  async function makeOrganization() {
    if (busy) return;
    setBusy("organization");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(null); return; }
    const { data: org } = await supabase.from("organizations")
      .insert({ user_id: user.id, name: target.name, location: target.location ?? null })
      .select("*").single();
    if (org) {
      await supabase.from("outreach_targets")
        .update({ organization_id: org.id, contact_id: null })
        .eq("id", target.id);
      onLinked({ organization_id: org.id, contact_id: null, organization: org as Organization, contact: null });
    }
    setBusy(null);
  }

  async function makeLead() {
    if (busy) return;
    setBusy("person");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(null); return; }
    const parts = target.name.trim().split(/\s+/);
    const first = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(" ");
    const last  = parts.length === 1 ? "" : parts[parts.length - 1];
    const { data: contact } = await supabase.from("contacts")
      .insert({
        user_id: user.id,
        first_name: first, last_name: last,
        is_lead: true, lead_stage: "new", archived: false,
      })
      .select("*, organization:organizations(*)").single();
    if (contact) {
      await supabase.from("outreach_targets")
        .update({ contact_id: contact.id, organization_id: null })
        .eq("id", target.id);
      onLinked({ contact_id: contact.id, organization_id: null, contact: contact as Contact, organization: null });
    }
    setBusy(null);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--color-off-white)" }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "60px 32px 80px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-grey)", marginBottom: 12 }}>
          Set up workspace
        </p>
        <h3 style={{ fontSize: 18, color: "var(--color-charcoal)", marginBottom: 6 }}>
          What is <span style={{ fontWeight: 600 }}>{target.name}</span>?
        </h3>
        <p style={{ fontSize: 13, color: "var(--color-grey)", lineHeight: 1.55, marginBottom: 24 }}>
          A target wraps a person or an organization in Network. Link an existing record — or create a new one — and the canvas, tasks, notes, files, and activity all live there, visible from both this pipeline and the Network module.
        </p>

        {/* Link an existing Network record */}
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 8 }}>
          Link an existing record
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {([
            { value: "organization" as const, icon: <Building2 size={13} strokeWidth={1.75} />, label: "Organization" },
            { value: "person" as const,       icon: <User      size={13} strokeWidth={1.75} />, label: "Person" },
          ]).map(({ value, icon, label }) => (
            <button key={value} type="button" onClick={() => { setLinkKind(value); setQuery(""); }}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "6px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                background: linkKind === value ? "var(--color-cream)" : "var(--color-warm-white)",
                border: linkKind === value ? "0.5px solid var(--color-charcoal)" : "0.5px solid var(--color-border)",
                color: "var(--color-charcoal)",
              }}>
              {icon} {label}
            </button>
          ))}
        </div>
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={linkKind === "person" ? "Search people by name or email…" : "Search organizations…"}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 8,
            background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)",
            color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
          }}
        />
        {query.trim() && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2, border: "0.5px solid var(--color-border)", borderRadius: 8, overflow: "hidden", background: "var(--color-warm-white)" }}>
            {linkKind === "person" && contactResults.map(c => (
              <button key={c.id} type="button" onClick={() => linkContact(c)}
                style={{ textAlign: "left", padding: "8px 10px", fontSize: 12, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--color-charcoal)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {`${c.first_name} ${c.last_name}`.trim()}
                {c.organization?.name && <span style={{ color: "var(--color-grey)", marginLeft: 6 }}>· {c.organization.name}</span>}
              </button>
            ))}
            {linkKind === "organization" && orgResults.map(o => (
              <button key={o.id} type="button" onClick={() => linkOrg(o)}
                style={{ textAlign: "left", padding: "8px 10px", fontSize: 12, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--color-charcoal)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {o.name}
                {(o.location ?? o.website) && <span style={{ color: "var(--color-grey)", marginLeft: 6 }}>· {o.location ?? o.website}</span>}
              </button>
            ))}
            {((linkKind === "person" && contactResults.length === 0) || (linkKind === "organization" && orgResults.length === 0)) && (
              <p style={{ fontSize: 11, color: "var(--color-grey)", padding: "8px 10px" }}>No matches.</p>
            )}
          </div>
        )}

        {/* Or create a new one from the target's name */}
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", margin: "22px 0 8px" }}>
          Or create a new record
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <button type="button" onClick={makeOrganization} disabled={busy !== null}
            style={{
              textAlign: "left", padding: 14, borderRadius: 12,
              background: "var(--color-warm-white)",
              border: "0.5px solid var(--color-border)",
              cursor: busy ? "default" : "pointer", opacity: busy && busy !== "organization" ? 0.5 : 1,
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 4 }}>
              {busy === "organization" ? "Creating…" : `New organization`}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-grey)", lineHeight: 1.5 }}>
              Gallery, brand, publication, fair. Workspace lives on the org, shared across any targets that wrap it.
            </div>
          </button>
          <button type="button" onClick={makeLead} disabled={busy !== null}
            style={{
              textAlign: "left", padding: 14, borderRadius: 12,
              background: "var(--color-warm-white)",
              border: "0.5px solid var(--color-border)",
              cursor: busy ? "default" : "pointer", opacity: busy && busy !== "person" ? 0.5 : 1,
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 4 }}>
              {busy === "person" ? "Creating…" : "New person"}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-grey)", lineHeight: 1.5 }}>
              A specific human — curator, editor, buyer. Creates a lead in Network you can convert to a contact later.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Editable plain text field ─────────────────────────────────────────────────
//
// Shared inline-edit primitive with the Target presets: an 80px label column
// and click-to-edit blanks (no open-when-empty). The Link row passes `isLink`
// to render the value as an external anchor with an inline Edit affordance.

function EditableField(props: { label: string; value: string | null; placeholder?: string; onSave: (v: string | null) => void; isLink?: boolean; openWhenEmpty?: boolean }) {
  return <SharedEditableField {...props} labelWidth={80} />;
}

// ── Date field ────────────────────────────────────────────────────────────────
//
// Uses the shared, styled DatePillField (same control as Projects' Start/Due)
// instead of a native date input. Target stores `results_deadline` as a full
// ISO timestamp, so we adapt at the boundary: ISO → Date in (anchored to noon
// so a date-only value doesn't drift across timezones), Date → ISO out via the
// existing dateInputToISO helper. Past deadlines flag the pill red via `alert`.

function DateField({ label, value, onSave }: {
  label: string; value: string | null; onSave: (v: string | null) => void;
}) {
  const dateValue = value ? new Date(value) : null;
  const overdue = !!value && new Date(value).getTime() < Date.now();

  function buildISO(d: Date): string | null {
    return dateInputToISO(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid var(--color-border)" }}>
      <span style={{ fontSize: 11, color: "var(--color-grey)", width: 80, flexShrink: 0 }}>{label}</span>
      <DatePillField
        value={dateValue}
        onChange={d => onSave(buildISO(d))}
        onClear={value ? () => onSave(null) : undefined}
        alert={overdue}
      />
    </div>
  );
}

// ── Linked Projects rail panel ────────────────────────────────────────────────

function LinkedProjects({ targetId }: { targetId: string }) {
  const [links, setLinks]       = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<Project[]>([]);
  // Bumped when an external "promote to project" action runs, so this panel
  // re-fetches without remounting the entire TargetDetailPanel.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function onProjectLinked(e: Event) {
      const detail = (e as CustomEvent<{ target_id?: string }>).detail;
      if (detail?.target_id === targetId) setRefreshKey(k => k + 1);
    }
    window.addEventListener("outreach:project-linked", onProjectLinked);
    return () => window.removeEventListener("outreach:project-linked", onProjectLinked);
  }, [targetId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("outreach_target_projects")
        .select("project:projects(*)")
        .eq("target_id", targetId);
      if (cancelled) return;
      const projects = ((data ?? []) as unknown as { project: Project }[])
        .map(r => r.project).filter(Boolean);
      setLinks(projects);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [targetId, refreshKey]);

  useEffect(() => {
    if (!adding) return;
    const q = query.trim();
    const handle = setTimeout(async () => {
      const supabase = createClient();
      const builder = supabase.from("projects").select("*").order("updated_at", { ascending: false }).limit(8);
      const { data } = q ? await builder.ilike("title", `%${q}%`) : await builder;
      const existing = new Set(links.map(p => p.id));
      setResults(((data ?? []) as Project[]).filter(p => !existing.has(p.id)));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, adding, links]);

  async function attach(project: Project) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLinks(prev => [...prev, project]);
    setAdding(false);
    setQuery("");
    await supabase.from("outreach_target_projects").insert({
      target_id:  targetId,
      project_id: project.id,
      user_id:    user.id,
    });
  }

  async function detach(projectId: string) {
    setLinks(prev => prev.filter(p => p.id !== projectId));
    await createClient().from("outreach_target_projects")
      .delete().eq("target_id", targetId).eq("project_id", projectId);
  }

  return (
    <div style={{ marginTop: 14, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)" }}>
          Linked projects
        </p>
        <button onClick={() => setAdding(v => !v)} title={adding ? "Cancel" : "Link a project"}
          style={{ background: "none", border: "none", color: "var(--color-grey)", cursor: "pointer", padding: 0, display: "flex" }}>
          {adding ? <X size={11} /> : <Plus size={12} />}
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 11, color: "var(--color-grey)", padding: "4px 0" }}>Loading…</p>
      ) : links.length === 0 && !adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, background: "transparent", border: "0.5px dashed var(--color-border)", cursor: "pointer", color: "var(--color-grey)", fontFamily: "inherit", fontSize: 11 }}
        >
          <Link2 size={11} strokeWidth={1.75} />
          Link a project
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {links.map(p => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 8px", borderRadius: 6,
              background: "var(--color-off-white)",
              border: "0.5px solid var(--color-border)",
            }}>
              <FolderOpen size={11} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
              <a href={`/projects?projectId=${p.id}`}
                style={{ flex: 1, fontSize: 11, color: "var(--color-charcoal)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
              >
                {p.title}
              </a>
              <button onClick={() => detach(p.id)} title="Unlink"
                style={{ background: "none", border: "none", color: "var(--color-grey)", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ marginTop: 6 }}>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects…"
            style={{
              width: "100%", padding: "5px 8px", fontSize: 11, borderRadius: 6,
              background: "var(--color-warm-white)",
              border: "0.5px solid var(--color-border)",
              color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
            }}
          />
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto" }}>
            {results.length === 0 ? (
              <p style={{ fontSize: 10, color: "var(--color-grey)", padding: "4px 8px" }}>No results</p>
            ) : results.map(p => (
              <button key={p.id} onClick={() => attach(p)}
                style={{ textAlign: "left", padding: "5px 8px", borderRadius: 5, background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "var(--color-charcoal)", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Linked People rail panel ──────────────────────────────────────────────────
// Currently surfaces the single linked contact from `target.contact_id`. The
// schema supports only one direct link today; surfacing it here as a section
// gives the rail a consistent shape and a clear "Link a person" affordance.

function LinkedPeople({ target, onChange }: { target: OutreachTarget; onChange: (next: { contact_id: string | null }) => void }) {
  const [adding, setAdding]   = useState(false);
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<Contact[]>([]);

  useEffect(() => {
    if (!adding) return;
    const q = query.trim();
    const handle = setTimeout(async () => {
      const supabase = createClient();
      if (q) {
        const { data } = await supabase.from("contacts")
          .select("*, organization:organizations(*)")
          .eq("archived", false)
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(8);
        setResults((data ?? []) as Contact[]);
      } else {
        const { data } = await supabase.from("contacts")
          .select("*, organization:organizations(*)")
          .eq("archived", false)
          .order("last_contacted_at", { ascending: false, nullsFirst: false })
          .limit(8);
        setResults((data ?? []) as Contact[]);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, adding]);

  const c = target.contact ?? null;

  return (
    <div style={{ marginTop: 14, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)" }}>
          Linked people
        </p>
        {c && !adding && (
          <button onClick={() => { onChange({ contact_id: null }); }} title="Unlink"
            style={{ background: "none", border: "none", color: "var(--color-grey)", cursor: "pointer", padding: 0, display: "flex" }}>
            <X size={11} />
          </button>
        )}
        {!c && (
          <button onClick={() => setAdding(v => !v)} title={adding ? "Cancel" : "Link a person"}
            style={{ background: "none", border: "none", color: "var(--color-grey)", cursor: "pointer", padding: 0, display: "flex" }}>
            {adding ? <X size={11} /> : <Plus size={12} />}
          </button>
        )}
      </div>

      {c ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 8px", borderRadius: 6,
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
        }}>
          <div style={{ width: 22, height: 22, borderRadius: 99, background: "var(--color-cream)", color: "var(--color-text-secondary)", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {(c.first_name[0] ?? "") + (c.last_name[0] ?? "")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <a href={`/network?contactId=${c.id}`}
              style={{ fontSize: 12, color: "var(--color-charcoal)", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
            >
              {c.first_name} {c.last_name}
            </a>
            {c.organization?.name && <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{c.organization.name}</span>}
          </div>
        </div>
      ) : !adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, background: "transparent", border: "0.5px dashed var(--color-border)", cursor: "pointer", color: "var(--color-grey)", fontFamily: "inherit", fontSize: 11 }}
        >
          <Users size={11} strokeWidth={1.75} />
          Link a person
        </button>
      ) : null}

      {adding && !c && (
        <div style={{ marginTop: 6 }}>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search contacts…"
            style={{
              width: "100%", padding: "5px 8px", fontSize: 11, borderRadius: 6,
              background: "var(--color-warm-white)",
              border: "0.5px solid var(--color-border)",
              color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
            }}
          />
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto" }}>
            {results.length === 0 ? (
              <p style={{ fontSize: 10, color: "var(--color-grey)", padding: "4px 8px" }}>No results</p>
            ) : results.map(r => (
              <button key={r.id} onClick={() => { onChange({ contact_id: r.id }); setAdding(false); setQuery(""); }}
                style={{ textAlign: "left", padding: "5px 8px", borderRadius: 5, background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "var(--color-charcoal)", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {r.first_name} {r.last_name}
                {r.organization?.name && <span style={{ color: "var(--color-grey)", marginLeft: 6 }}>· {r.organization.name}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Workspace tab stubs ───────────────────────────────────────────────────────
// Tasks / Notes / Files panes are scaffolded placeholders for now — they
// follow the Project detail panel structure so the user immediately reads
// them as the same surface, but full CRUD wiring lives in a follow-up.

function StubPane({ heading, body }: { heading: string; body: string }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 32, background: "var(--color-off-white)",
    }}>
      <div style={{ maxWidth: 360, textAlign: "center" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 6 }}>{heading}</p>
        <p style={{ fontSize: 11.5, color: "var(--color-grey)", lineHeight: 1.55 }}>{body}</p>
      </div>
    </div>
  );
}

// ── Props / main component ────────────────────────────────────────────────────

interface Props {
  target: OutreachTarget;
  pipeline: OutreachPipeline & { stages: PipelineStage[] };
  onClose: () => void;
  onUpdated: (target: OutreachTarget) => void;
  onDeleted: (targetId: string) => void;
}

type SectionTab = "canvas" | "activity" | "tasks" | "people" | "notes" | "files";

export default function TargetDetailPanel({ target: initialTarget, pipeline, onClose, onUpdated, onDeleted }: Props) {
  const supabase = createClient();
  const { options: projectOptions } = useProjectOptions();

  const [target,       setTarget]       = useState(initialTarget);
  const [activeTab,    setActiveTab]    = useState<SectionTab>("canvas");
  const [maximized,    setMaximized]    = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Lightweight toast — no toast lib in the app yet, so each action sets a
  // string + auto-dismisses after 2s. Replace with a real toast surface when
  // one lands.
  const [toast,            setToast]            = useState<string | null>(null);
  const [promoteOpen,      setPromoteOpen]      = useState(false);
  const [promoteTitle,     setPromoteTitle]     = useState("");
  const [promoteType,      setPromoteType]      = useState<string>("");
  const [promoting,        setPromoting]        = useState(false);

  // The wrapped Network entity (Contact or Organization) the target points at.
  // Every workspace tab — canvas, activity, tasks, notes, files — reads/writes
  // this record, so the target is a thin pipeline-position wrapper rather than a
  // separate entity. `null` means an orphan target (a bare card) that hasn't
  // been linked yet; opening it surfaces the link-or-create prompt.
  const entity = useMemo(() => {
    if (target.contact_id) {
      return {
        kind:             "contact" as const,
        id:               target.contact_id,
        fkColumn:         "contact_id" as const,
        name:             target.contact ? `${target.contact.first_name} ${target.contact.last_name}`.trim() : target.name,
        route:            `/network?contactId=${target.contact_id}`,
        filesTable:       "contact_files" as const,
        activitiesTable:  "contact_activities" as const,
        parentTable:      "contacts" as const,
        parentBumpColumn: "last_contacted_at" as const,
        parentCurrent:    target.contact?.last_contacted_at ?? null,
        buildStoragePath: ({ userId, id, fileName }: { userId: string; id: string; fileName: string }) => `${userId}/${id}/${Date.now()}_${fileName}`,
      };
    }
    if (target.organization_id) {
      return {
        kind:             "organization" as const,
        id:               target.organization_id,
        fkColumn:         "organization_id" as const,
        name:             target.organization?.name ?? target.name,
        route:            `/network?view=organizations&organizationId=${target.organization_id}`,
        filesTable:       "organization_files" as const,
        activitiesTable:  "organization_activities" as const,
        parentTable:      "organizations" as const,
        parentBumpColumn: "last_touched_at" as const,
        parentCurrent:    target.organization?.last_touched_at ?? null,
        buildStoragePath: ({ userId, id, fileName }: { userId: string; id: string; fileName: string }) => `${userId}/org-files/${id}/${Date.now()}_${fileName}`,
      };
    }
    return null;
  }, [target.contact_id, target.organization_id, target.contact, target.organization, target.name]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(handle);
  }, [toast]);

  // Reset the promote form when we open it so it's always pre-filled with the
  // current target's name and the user's default project type.
  function openPromote() {
    setPromoteTitle(target.name);
    setPromoteType(projectOptions.type[0]?.key ?? "");
    setPromoteOpen(true);
  }

  async function convertLeadToContact() {
    if (!target.contact_id || !target.contact?.is_lead) return;
    const { data } = await supabase.from("contacts")
      .update({ is_lead: false, lead_stage: null })
      .eq("id", target.contact_id)
      .select("*, organization:organizations(*)")
      .single();
    if (data) {
      // Reflect the new is_lead state locally so the action button hides.
      setTarget(prev => ({ ...prev, contact: data as Contact }));
      setToast("Converted to contact.");
    }
  }

  async function promoteToProject() {
    const title = promoteTitle.trim();
    if (!title) return;
    setPromoting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPromoting(false); return; }

    const { data: project, error: pErr } = await supabase.from("projects")
      .insert({
        user_id: user.id,
        title,
        type:    promoteType || null,
        status:  projectOptions.status[0]?.key ?? "planning",
        priority: "medium",
      })
      .select("*")
      .single();
    if (pErr || !project) { setPromoting(false); setToast(pErr?.message ?? "Failed to create project."); return; }

    await supabase.from("outreach_target_projects").insert({
      target_id:  target.id,
      project_id: project.id,
      user_id:    user.id,
    });

    setPromoting(false);
    setPromoteOpen(false);
    setToast("Project created.");
    // Notify the linked-projects rail panel to refresh — it re-fetches on
    // targetId change, so we trigger a soft remount by dispatching an event
    // that LinkedProjects can listen for. Simpler path: re-run its effect by
    // bumping the target object reference.
    setTarget(prev => ({ ...prev }));
    window.dispatchEvent(new CustomEvent("outreach:project-linked", { detail: { target_id: target.id, project_id: project.id } }));
  }

  const activeStages  = pipeline.stages.filter(s => !s.is_outcome);
  const outcomeStages = pipeline.stages.filter(s =>  s.is_outcome);

  // Reset panel chrome when a different target is opened.
  useEffect(() => {
    setTarget(initialTarget);
    setActiveTab("canvas");
    setSettingsOpen(false);
  }, [initialTarget.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // Hide floating Ash FAB in scrim mode
  useEffect(() => {
    if (!maximized) {
      const style = document.createElement("style");
      style.id = "target-panel-ash-hide";
      style.textContent = ".ash-fab { opacity: 0 !important; pointer-events: none !important; }";
      document.head.appendChild(style);
    }
    return () => { document.getElementById("target-panel-ash-hide")?.remove(); };
  }, [maximized]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmDelete) { setConfirmDelete(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirmDelete]);

  // ── Field saves ─────────────────────────────────────────────────────────────

  async function saveField(updates: Partial<OutreachTarget>) {
    const { data } = await supabase
      .from("outreach_targets")
      .update({ ...updates, last_touched_at: new Date().toISOString() })
      .eq("id", target.id)
      .select("*, pipeline:outreach_pipelines(*), stage:pipeline_stages(*), contact:contacts(*, organization:organizations(*)), organization:organizations(*)")
      .single();
    if (data) { setTarget(data as OutreachTarget); onUpdated(data as OutreachTarget); }
  }

  async function changeStage(stageId: string) {
    await saveField({ stage_id: stageId });
  }

  async function handleDelete() {
    await supabase.from("outreach_targets").delete().eq("id", target.id);
    onDeleted(target.id);
    onClose();
  }

  const currentStage = pipeline.stages.find(s => s.id === target.stage_id);
  const stale = daysSince(target.last_touched_at);

  const NAV_ITEMS: { key: SectionTab; label: string; icon: React.ReactNode }[] = [
    { key: "canvas",   label: "Canvas",   icon: <FileText    size={13} strokeWidth={1.75} /> },
    { key: "activity", label: "Activity", icon: <Calendar    size={13} strokeWidth={1.75} /> },
    { key: "tasks",  label: "Tasks",  icon: <CheckSquare size={13} strokeWidth={1.75} /> },
    { key: "people", label: "People", icon: <Users       size={13} strokeWidth={1.75} /> },
    { key: "notes",  label: "Notes",  icon: <FileText    size={13} strokeWidth={1.75} /> },
    { key: "files",  label: "Files",  icon: <FolderOpen  size={13} strokeWidth={1.75} /> },
  ];

  // Contextual Ash prompts — same intelligence the old bottom AshStrip had,
  // surfaced as an AshPromptsModule in the left rail to match Projects/People.
  const ashContext = useMemo<{ headline: string; primary: AshPrompt; prompts: AshPrompt[] }>(() => {
    const name = target.name;
    const stageName = currentStage?.name ?? "first stage";
    let headline: string;
    let primary:  AshPrompt;

    if (currentStage?.is_outcome) {
      headline = `${name} is at an outcome stage.`;
      primary  = { label: "Summarize outcome", message: `Write a brief summary of what happened with ${name} — the outcome, key context, and any follow-on actions.` };
    } else if (stale > 30) {
      headline = `${name} hasn't been touched in ${stale} days.`;
      primary  = { label: "Re-engage", message: `Draft a re-engagement message for ${name}. It's been ${stale} days — keep it natural and give them an easy reason to respond.` };
    } else if (stale > 14) {
      headline = `You last touched ${name} ${stale} days ago.`;
      primary  = { label: "Follow up", message: `Draft a follow-up message for ${name}. It's been ${stale} days — be concise, reference past context, and suggest a clear next step.` };
    } else if (currentStage?.meta_stage === "identify") {
      headline = `${name} is at ${stageName}. Research + strong opener.`;
      primary  = { label: "Prepare outreach", message: `Help me prepare to reach out to ${name} in the ${pipeline.name} pipeline. What should I know about them, and what's the best opening message?` };
    } else if (currentStage?.meta_stage === "submit") {
      headline = `${name} is at ${stageName}. Time for a pitch.`;
      primary  = { label: "Draft pitch", message: `Draft a compelling pitch or submission message for ${name} in the ${pipeline.name} pipeline. Keep it targeted and professional.` };
    } else if (currentStage?.meta_stage === "discuss") {
      headline = `You're in discussion with ${name}.`;
      primary  = { label: "Move forward", message: `How do I move my conversation with ${name} forward? We're at ${stageName}. Give me a clear next move to advance toward a yes or no.` };
    } else {
      headline = `Think through the next move with ${name}.`;
      primary  = { label: "Next step", message: `What's the best next step with ${name} in my ${pipeline.name} pipeline? Give me a specific action and the message to send.` };
    }

    const prompts: AshPrompt[] = [
      { label: "How should I approach this?", message: `How should I approach ${name} in my ${pipeline.name} pipeline?` },
      { label: "Draft a message",            message: `Draft a message for ${name} appropriate to where we are in the ${pipeline.name} pipeline.` },
      { label: "What might go wrong?",       message: `What could derail my outreach to ${name}, and how do I mitigate it?` },
    ];

    return { headline, primary, prompts };
  }, [target.name, stale, currentStage, pipeline.name]);

  return (
    <DetailPanelShell maximized={maximized} onClose={onClose}>

        {/* ── Left sidebar ── */}
        <div style={{
          width: 268, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)",
          borderRadius: maximized ? 0 : "12px 0 0 12px",
        }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 12px" }}>

            {/* Identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0, background: pipeline.color + "18", color: pipeline.color }}>
                {target.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-charcoal)", lineHeight: 1.2 }}>
                  <EditableField label="" value={target.name} placeholder="Target name" onSave={v => v && saveField({ name: v })} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 9999, background: pipeline.color + "18", color: pipeline.color }}>
                  {pipeline.name}
                </span>
              </div>
            </div>

            {/* Stage */}
            <div data-tour-target="outreach.detail-stages" style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>Stage</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {activeStages.map(s => (
                  <button key={s.id} onClick={() => changeStage(s.id)} style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 9999,
                    background: target.stage_id === s.id ? pipeline.color : "var(--color-cream)",
                    color: target.stage_id === s.id ? "white" : "var(--color-text-secondary)",
                    border: `0.5px solid ${target.stage_id === s.id ? pipeline.color : "var(--color-border)"}`,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: target.stage_id === s.id ? 600 : 400,
                  }}>
                    {s.name}
                  </button>
                ))}
              </div>
              {outcomeStages.length > 0 && (
                <>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginTop: 10, marginBottom: 6 }}>Outcome</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {outcomeStages.map(s => (
                      <button key={s.id} onClick={() => changeStage(s.id)} style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 9999,
                        background: target.stage_id === s.id ? "rgba(var(--color-charcoal-rgb),0.12)" : "var(--color-cream)",
                        color: target.stage_id === s.id ? "var(--color-charcoal)" : "var(--color-text-secondary)",
                        border: `0.5px solid ${target.stage_id === s.id ? "rgba(var(--color-charcoal-rgb),0.25)" : "var(--color-border)"}`,
                        cursor: "pointer", fontFamily: "inherit", fontWeight: target.stage_id === s.id ? 600 : 400,
                      }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Details */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Details</p>
              <EditableField label="Location" value={target.location} openWhenEmpty onSave={v => saveField({ location: v })} />
              <EditableField label="Link" value={target.link} placeholder="—" isLink onSave={v => saveField({ link: v })} />
              <DateField label="Deadline" value={target.results_deadline} onSave={v => saveField({ results_deadline: v })} />
              <div style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 11, color: "var(--color-grey)", width: 80, flexShrink: 0 }}>Touched</span>
                <span style={{ fontSize: 12, color: stale > 14 ? "var(--color-gold)" : "var(--color-text-secondary)" }}>
                  {fmtDate(target.last_touched_at)}
                </span>
              </div>
            </div>

            {/* Linked projects */}
            <LinkedProjects targetId={target.id} />

            {/* Linked people */}
            <LinkedPeople target={target} onChange={(next) => saveField(next)} />

            {/* Actions — convert linked lead to contact, promote target to
                project. Both are reversible by hand so we don't auto-archive
                the target after either action. */}
            <div style={{ marginTop: 14, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>
                Actions
              </p>
              {target.contact?.is_lead && (
                <button onClick={convertLeadToContact}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, border: "0.5px solid var(--color-border)", background: "var(--color-off-white)", cursor: "pointer", fontFamily: "inherit", marginBottom: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-off-white)"}>
                  <UserCheck size={12} strokeWidth={1.75} style={{ color: "var(--color-green-deep)" }} />
                  <span style={{ fontSize: 11.5, color: "var(--color-charcoal)" }}>Convert to contact</span>
                </button>
              )}
              {!promoteOpen ? (
                <button onClick={openPromote}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 7, border: "0.5px solid var(--color-border)", background: "var(--color-off-white)", cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-off-white)"}>
                  <FolderPlus size={12} strokeWidth={1.75} style={{ color: "var(--color-sage)" }} />
                  <span style={{ fontSize: 11.5, color: "var(--color-charcoal)" }}>Promote to project</span>
                </button>
              ) : (
                <div style={{ padding: 8, borderRadius: 8, border: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-grey)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    New project from target
                  </p>
                  <input type="text" value={promoteTitle}
                    onChange={e => setPromoteTitle(e.target.value)}
                    placeholder="Project title"
                    style={{ width: "100%", padding: "5px 8px", fontSize: 11.5, borderRadius: 6, background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none", marginBottom: 6 }} />
                  <Select
                    value={promoteType}
                    onChange={setPromoteType}
                    options={projectOptions.type.map(o => ({ value: o.key, label: o.label }))}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
                    <button onClick={() => setPromoteOpen(false)}
                      style={{ padding: "4px 10px", fontSize: 11, background: "transparent", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                      Cancel
                    </button>
                    <button onClick={promoteToProject} disabled={!promoteTitle.trim() || promoting}
                      style={{ padding: "4px 12px", fontSize: 11, fontWeight: 600, background: "var(--color-sage)", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", opacity: promoting ? 0.6 : 1 }}>
                      {promoting ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div data-tour-target="outreach.detail-workspace" style={{ marginTop: 14, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Workspace</p>
              {NAV_ITEMS.map(item => {
                const active = activeTab === item.key;
                return (
                  <button key={item.key} onClick={() => setActiveTab(item.key)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                    borderRadius: 7, border: "none", background: active ? "rgba(var(--color-sage-rgb),0.12)" : "transparent",
                    cursor: "pointer", fontFamily: "inherit", marginBottom: 1,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ color: active ? "var(--color-sage-deep)" : "var(--color-grey)" }}>{item.icon}</span>
                    <span style={{ fontSize: 12, flex: 1, textAlign: "left", color: active ? "var(--color-sage-deep)" : "var(--color-grey)", fontWeight: active ? 500 : 400 }}>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Ash module — contextual prompts, lives in the left rail */}
            <AshPromptsModule
              headline={ashContext.headline}
              primaryPrompt={ashContext.primary}
              prompts={ashContext.prompts}
              context={{ pipeline: { name: pipeline.name, color: pipeline.color }, target: { name: target.name } }}
              placeholder={`Ask Ash about ${target.name}…`}
            />
          </div>

          {/* Settings */}
          <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "4px 8px 8px", flexShrink: 0 }}>
            {settingsOpen && (
              <div style={{ paddingBottom: 4 }}>
                {confirmDelete ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px" }}>
                    <span style={{ fontSize: 12, color: "var(--color-charcoal)", flex: 1 }}>Delete this target?</span>
                    <button onClick={handleDelete} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--color-red-orange)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                    <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "transparent", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "var(--color-red-orange)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--color-red-rgb),0.07)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Trash2 size={13} strokeWidth={1.75} />
                    <span style={{ fontSize: 12 }}>Delete target</span>
                  </button>
                )}
              </div>
            )}
            <button onClick={() => setSettingsOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: settingsOpen ? "var(--color-surface-raised)" : "transparent", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { if (!settingsOpen) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (!settingsOpen) e.currentTarget.style.background = "transparent"; }}>
              <Settings size={13} strokeWidth={1.75} style={{ color: settingsOpen ? "var(--color-charcoal)" : "var(--color-grey)" }} />
              <span style={{ fontSize: 12, color: settingsOpen ? "var(--color-charcoal)" : "var(--color-grey)", fontWeight: settingsOpen ? 500 : 400 }}>Settings</span>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ marginLeft: "auto", color: "var(--color-grey)", transform: settingsOpen ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }}>
                <path d="M2 1l4 3-4 3"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Right: main area ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Top bar */}
          <div style={{
            height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 14px", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)",
            borderRadius: maximized ? 0 : "0 12px 0 0",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>
              {NAV_ITEMS.find(n => n.key === activeTab)?.label}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={() => setMaximized(v => !v)}
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {maximized ? <Minimize2 size={13} strokeWidth={1.75} /> : <Maximize2 size={13} strokeWidth={1.75} />}
              </button>
              <button onClick={onClose}
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Content. An orphan target (no linked Contact/Organization) shows the
              link-or-create prompt across every tab — there's no entity to attach
              work to yet. Once linked, all tabs read/write the wrapped record so
              it's the same data the user sees in Network. */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {!entity ? (
              <OrphanTargetPrompt
                target={target}
                onLinked={({ contact_id, organization_id, contact, organization }) => {
                  const next = {
                    ...target,
                    contact_id:      contact_id ?? null,
                    organization_id: organization_id ?? null,
                    contact:         contact ?? null,
                    organization:    organization ?? null,
                  } as OutreachTarget;
                  setTarget(next);
                  onUpdated(next);
                }}
              />
            ) : (
              <>
                {activeTab === "canvas" && (
                  <Canvas
                    key={`${entity.kind}:${entity.id}`}
                    scope={entity.parentTable === "organizations" ? "organization" : "contact"}
                    entityId={entity.id}
                  />
                )}
                {activeTab === "activity" && (
                  <EntityActivityTab
                    key={entity.id}
                    activitiesTable={entity.activitiesTable}
                    fkColumn={entity.fkColumn}
                    id={entity.id}
                    onLogged={() => { void saveField({}); }}
                    parent={{
                      table:        entity.parentTable,
                      bumpColumn:   entity.parentBumpColumn,
                      currentValue: entity.parentCurrent,
                      onBumped:     iso => setTarget(prev => entity.kind === "contact"
                        ? { ...prev, contact: prev.contact ? { ...prev.contact, last_contacted_at: iso } : prev.contact }
                        : { ...prev, organization: prev.organization ? { ...prev.organization, last_touched_at: iso } : prev.organization }),
                    }}
                  />
                )}
                {activeTab === "tasks"  && <EntityTasksTab key={entity.id} fkColumn={entity.fkColumn} id={entity.id} idPrefix="target" />}
                {activeTab === "people" && <StubPane heading="People at this target" body="Galleries, fairs, and publications usually involve more than one person. Link the directors, curators, and editors you're talking to here." />}
                {activeTab === "notes"  && <EntityNotesTab key={entity.id} fkColumn={entity.fkColumn} id={entity.id} idPrefix="target" />}
                {activeTab === "files"  && (
                  <EntityFilesTab
                    key={entity.id}
                    filesTable={entity.filesTable}
                    fkColumn={entity.fkColumn}
                    id={entity.id}
                    bucket="contact-files"
                    buildStoragePath={entity.buildStoragePath}
                    emptyHint="Decks, attachments, references — shared with this record in Network."
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Mini toast — local to the panel so it sits above the scrim and
            below any modal. Auto-dismisses after ~2s. */}
        {toast && (
          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            background: "var(--color-charcoal)", color: "var(--color-warm-white)",
            fontSize: 12, padding: "8px 16px", borderRadius: 999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            pointerEvents: "none",
            zIndex: 10,
          }}>
            {toast}
          </div>
        )}
    </DetailPanelShell>
  );
}
