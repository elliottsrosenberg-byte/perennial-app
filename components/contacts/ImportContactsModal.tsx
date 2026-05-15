"use client";

// CSV → contacts import flow.
//
// Three steps inside one modal:
//   1. file     — drop / pick a .csv (and we parse it client-side)
//   2. map      — assign each detected CSV header to a Perennial field
//   3. preview  — show first 5 rows mapped + summary, then Import
//
// Companies are looked up or created on the fly (case-insensitive by name)
// so imports don't pile up duplicates. Insert happens in chunks of 50 to keep
// requests small and surface failures incrementally.

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types/database";
import { X, Upload, FileText, ArrowRight, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

// ─── Field map ────────────────────────────────────────────────────────────────

type FieldKey =
  | "first_name" | "last_name" | "full_name"
  | "email" | "phone" | "company" | "title"
  | "location" | "website" | "tags" | "is_lead"
  | "_ignore";

interface FieldSpec {
  key:     FieldKey;
  label:   string;
  /** Header-name matchers (case-insensitive). First spec to match wins. */
  matches: RegExp[];
}

const FIELDS: FieldSpec[] = [
  { key: "first_name", label: "First name",   matches: [/^first.?name$|^fname$|^given/i] },
  { key: "last_name",  label: "Last name",    matches: [/^last.?name$|^lname$|^surname|^family/i] },
  { key: "full_name",  label: "Full name",    matches: [/^name$|^full.?name|^display/i] },
  { key: "email",      label: "Email",        matches: [/e-?mail|^email/i] },
  { key: "phone",      label: "Phone",        matches: [/phone|mobile|cell/i] },
  { key: "company",    label: "Company",      matches: [/compan|organi[sz]ation|employer|business/i] },
  { key: "title",      label: "Title / role", matches: [/title|role|position|^job/i] },
  { key: "location",   label: "Location",     matches: [/location|city|address/i] },
  { key: "website",    label: "Website",      matches: [/website|url|^web|domain/i] },
  { key: "tags",       label: "Tags",         matches: [/^tags?$|categor|group|labels?/i] },
  { key: "is_lead",    label: "Lead?",        matches: [/^lead\b|is.?lead|status/i] },
];

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: "_ignore", label: "— Skip column —" },
  ...FIELDS.map(f => ({ value: f.key, label: f.label })),
];

// ─── CSV parser ───────────────────────────────────────────────────────────────
//
// Minimal RFC-4180 parser — handles quoted fields, embedded commas, escaped
// quotes ("") and both LF / CRLF row endings. No streaming, no chunking; CSVs
// up to a few thousand rows parse fine in the browser. For large imports we'd
// move this server-side, but contacts imports are normally well under that.

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* swallow — handled with \n */ }
      else field += ch;
    }
  }
  // Trailing field / row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully empty rows (e.g. trailing newline)
  return rows.filter(r => r.some(c => c.trim().length > 0));
}

// ─── Coercion helpers ─────────────────────────────────────────────────────────

function splitFullName(full: string): { first: string; last: string } {
  const trimmed = full.trim().replace(/\s+/g, " ");
  if (!trimmed) return { first: "", last: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1) };
}

function parseLeadFlag(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "lead" || v === "true" || v === "yes" || v === "y" || v === "1";
}

function parseTags(value: string): string[] {
  return value.split(/[,;]/).map(t => t.trim()).filter(Boolean);
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = "file" | "map" | "preview" | "importing" | "done";

interface Props {
  onClose:    () => void;
  onImported: (contacts: Contact[]) => void;
}

export default function ImportContactsModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("file");

  // Parsing state
  const [filename, setFilename] = useState<string | null>(null);
  const [headers,  setHeaders]  = useState<string[]>([]);
  const [rows,     setRows]     = useState<string[][]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Mapping — index in headers array → FieldKey
  const [mapping, setMapping] = useState<FieldKey[]>([]);

  // Import result
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount,  setSkippedCount]  = useState(0);
  const [importError,   setImportError]   = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File step ────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setParseError(null);
    setFilename(file.name);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setParseError("Couldn't read this file. Make sure it's a valid CSV.");
      return;
    }
    const parsed = parseCSV(text);
    if (parsed.length < 2) {
      setParseError("This CSV is empty or only has a header row. Add some contacts to it and try again.");
      return;
    }
    const [hdr, ...body] = parsed;
    setHeaders(hdr);
    setRows(body);
    // Auto-map: for each header, pick the first FieldSpec whose regex matches.
    const initial: FieldKey[] = hdr.map(h => {
      const trimmed = h.trim();
      const match = FIELDS.find(f => f.matches.some(re => re.test(trimmed)));
      return match?.key ?? "_ignore";
    });
    setMapping(initial);
    setStep("map");
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  // ── Mapped preview rows ──────────────────────────────────────────────────

  const mappedPreview = useMemo(() => {
    return rows.slice(0, 5).map(r => buildContactPayload(r, headers, mapping));
  }, [rows, headers, mapping]);

  // Validation: need at least a name source mapped (first_name OR full_name)
  const hasNameMapping = mapping.some(m => m === "first_name" || m === "full_name");

  const validRowCount = useMemo(() => {
    if (!hasNameMapping) return 0;
    return rows.filter(r => {
      const p = buildContactPayload(r, headers, mapping);
      return Boolean(p.first_name || p.last_name);
    }).length;
  }, [rows, headers, mapping, hasNameMapping]);

  // ── Import ────────────────────────────────────────────────────────────────

  async function runImport() {
    setStep("importing");
    setImportError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setImportError("Not authenticated.");
      setStep("preview");
      return;
    }

    // Resolve / create companies up front so we don't hit the DB N times in
    // the contact insert loop. Lowercase-normalize to merge duplicates from
    // the CSV (e.g. "Acme Studio" + "acme studio").
    const companyCache = new Map<string, string>(); // lowercased name → company_id
    const desiredCompanies = new Set<string>();
    rows.forEach(r => {
      const p = buildContactPayload(r, headers, mapping);
      if (p.company_name) desiredCompanies.add(p.company_name.trim().toLowerCase());
    });

    if (desiredCompanies.size > 0) {
      const { data: existing } = await supabase
        .from("companies")
        .select("id, name")
        .eq("user_id", user.id);
      (existing ?? []).forEach((c: { id: string; name: string }) => {
        const key = c.name.toLowerCase().trim();
        if (desiredCompanies.has(key)) companyCache.set(key, c.id);
      });

      const toCreate = Array.from(desiredCompanies)
        .filter(n => !companyCache.has(n))
        .map(n => ({ user_id: user.id, name: capitalizeWords(n) }));
      if (toCreate.length > 0) {
        const { data: created } = await supabase
          .from("companies")
          .insert(toCreate)
          .select("id, name");
        (created ?? []).forEach((c: { id: string; name: string }) => {
          companyCache.set(c.name.toLowerCase().trim(), c.id);
        });
      }
    }

    // Build contact payloads
    const inserts: Array<Record<string, unknown>> = [];
    let skipped = 0;
    for (const r of rows) {
      const p = buildContactPayload(r, headers, mapping);
      if (!p.first_name && !p.last_name) { skipped++; continue; }
      const company_id = p.company_name
        ? companyCache.get(p.company_name.trim().toLowerCase()) ?? null
        : null;
      inserts.push({
        user_id:    user.id,
        first_name: p.first_name || "—",
        last_name:  p.last_name  || "",
        email:      p.email      || null,
        phone:      p.phone      || null,
        company_id,
        title:      p.title      || null,
        location:   p.location   || null,
        website:    p.website    || null,
        tags:       p.tags,
        status:     p.is_lead ? "active" : "active",
        is_lead:    p.is_lead,
        lead_stage: p.is_lead ? "identified" : null,
      });
    }

    // Insert in chunks of 50
    const created: Contact[] = [];
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      const { data, error } = await supabase
        .from("contacts")
        .insert(chunk)
        .select("*, company:companies(*)");
      if (error) {
        setImportError(`Imported ${created.length} of ${inserts.length} — Supabase error: ${error.message}`);
        setImportedCount(created.length);
        setSkippedCount(skipped);
        setStep("done");
        if (created.length > 0) onImported(created);
        return;
      }
      if (data) created.push(...(data as Contact[]));
    }

    setImportedCount(created.length);
    setSkippedCount(skipped);
    onImported(created);
    setStep("done");
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        background: "rgba(31,33,26,0.45)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 560, borderRadius: 16,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        boxShadow: "var(--shadow-overlay)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        maxHeight: "82vh",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "0.5px solid var(--color-border)",
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
              Import contacts
            </h2>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              {step === "file"      && "Drop a CSV from Google Contacts, Apple Contacts, or anywhere else."}
              {step === "map"       && "Match each CSV column to a Perennial field."}
              {step === "preview"   && `Reviewing ${validRowCount} contact${validRowCount === 1 ? "" : "s"} ready to import.`}
              {step === "importing" && "Bringing them in…"}
              {step === "done"      && "Import complete."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-text-tertiary)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Step progress */}
        <div style={{ display: "flex", gap: 4, padding: "10px 18px 6px", flexShrink: 0 }}>
          {(["file", "map", "preview"] as Step[]).map((s, i) => {
            const order: Record<Step, number> = { file: 0, map: 1, preview: 2, importing: 3, done: 3 };
            const active = order[step] >= i;
            return (
              <div
                key={s}
                style={{
                  flex: 1, height: 3, borderRadius: 99,
                  background: active ? "var(--color-sage)" : "var(--color-border)",
                  transition: "background 0.2s ease",
                }}
              />
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 18px" }}>

          {/* ── Step 1: File ── */}
          {step === "file" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                style={{
                  width: "100%", padding: "32px 24px",
                  borderRadius: 12,
                  border: "1px dashed var(--color-border-strong)",
                  background: "var(--color-surface-sunken)",
                  cursor: "pointer", fontFamily: "inherit",
                  textAlign: "center",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: "var(--color-cream)",
                  border: "0.5px solid var(--color-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--color-sage)",
                }}>
                  <Upload size={17} strokeWidth={1.75} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  Drop a CSV or click to choose
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  Headers in the first row · we&apos;ll match columns next
                </span>
              </button>
              {parseError && (
                <p style={{ fontSize: 12, color: "var(--color-red-orange)", marginTop: 12 }}>
                  {parseError}
                </p>
              )}

              <div style={{
                marginTop: 16, padding: "12px 14px", borderRadius: 10,
                background: "rgba(155,163,122,0.08)",
                border: "0.5px solid rgba(155,163,122,0.20)",
              }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 4 }}>
                  Export tips
                </p>
                <ul style={{ fontSize: 11, lineHeight: 1.6, color: "var(--color-text-secondary)", paddingLeft: 16, listStyle: "disc" }}>
                  <li><strong>Google Contacts</strong>: Settings → Export → Google CSV</li>
                  <li><strong>Apple Contacts</strong>: select all → File → Export → vCard, then convert to CSV with any free converter</li>
                  <li>Common columns we recognize: name, email, phone, company, tags</li>
                </ul>
              </div>
            </>
          )}

          {/* ── Step 2: Map ── */}
          {step === "map" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                background: "var(--color-surface-sunken)", borderRadius: 8,
                fontSize: 11, color: "var(--color-text-secondary)",
              }}>
                <FileText size={13} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)" }} />
                <span style={{ flex: 1, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {filename}
                </span>
                <span>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
              </div>

              {!hasNameMapping && (
                <p style={{ fontSize: 11, color: "var(--color-red-orange)", padding: "0 2px" }}>
                  Map at least one column to <strong>First name</strong> or <strong>Full name</strong> so contacts have a label.
                </p>
              )}

              <div style={{
                display: "grid", gridTemplateColumns: "1fr auto 1fr",
                gap: 8, alignItems: "center",
                padding: "8px 4px 4px",
                fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.07em", color: "var(--color-text-tertiary)",
              }}>
                <span>CSV column</span>
                <span />
                <span>Perennial field</span>
              </div>

              {headers.map((header, i) => {
                const sample = rows[0]?.[i] ?? "";
                return (
                  <div
                    key={`${header}-${i}`}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr auto 1fr",
                      gap: 8, alignItems: "center",
                    }}
                  >
                    <div style={{
                      padding: "8px 10px", borderRadius: 7,
                      background: "var(--color-surface-sunken)",
                      border: "0.5px solid var(--color-border)",
                      fontSize: 12, minWidth: 0,
                    }}>
                      <div style={{ fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {header || <span style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>(blank)</span>}
                      </div>
                      {sample && (
                        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          e.g. {sample}
                        </div>
                      )}
                    </div>
                    <ArrowRight size={12} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)" }} />
                    <Select
                      value={mapping[i] ?? "_ignore"}
                      onChange={(v) => {
                        const next = [...mapping];
                        next[i] = v as FieldKey;
                        setMapping(next);
                      }}
                      options={FIELD_OPTIONS}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 3: Preview ── */}
          {step === "preview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{
                padding: "12px 14px", borderRadius: 10,
                background: "rgba(155,163,122,0.08)",
                border: "0.5px solid rgba(155,163,122,0.20)",
              }}>
                <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-text-primary)" }}>
                  <strong>{validRowCount}</strong> contact{validRowCount === 1 ? "" : "s"} will be imported.
                  {rows.length - validRowCount > 0 && (
                    <> <span style={{ color: "var(--color-text-tertiary)" }}>·</span>{" "}
                      {rows.length - validRowCount} row{rows.length - validRowCount === 1 ? "" : "s"} skipped (no name).
                    </>
                  )}
                </p>
              </div>

              <div>
                <p style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--color-text-tertiary)",
                  marginBottom: 6,
                }}>
                  Preview · first {Math.min(5, mappedPreview.length)} rows
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {mappedPreview.map((p, i) => (
                    <div key={i} style={{
                      padding: "8px 10px", borderRadius: 8,
                      background: "var(--color-surface-sunken)",
                      border: "0.5px solid var(--color-border)",
                      fontSize: 12,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                          {(p.first_name || p.last_name) ? `${p.first_name} ${p.last_name}`.trim() : <em style={{ color: "var(--color-red-orange)" }}>Missing name — will skip</em>}
                        </span>
                        {p.is_lead && (
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: "rgba(184,134,11,0.12)", color: "#b8860b", fontWeight: 600 }}>
                            Lead
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 3, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {p.email     && <span>{p.email}</span>}
                        {p.phone     && <span>{p.phone}</span>}
                        {p.company_name && <span>{p.company_name}</span>}
                        {p.title     && <span>{p.title}</span>}
                        {p.location  && <span>{p.location}</span>}
                      </div>
                      {p.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                          {p.tags.slice(0, 5).map(t => (
                            <span key={t} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: "var(--color-cream)", color: "#6b6860", fontWeight: 500, border: "0.5px solid var(--color-border)" }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Importing ── */}
          {step === "importing" && (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <div style={{
                width: 38, height: 38, borderRadius: "50%",
                border: "2px solid var(--color-border)", borderTopColor: "var(--color-sage)",
                margin: "0 auto 14px",
                animation: "perennial-import-spin 0.8s linear infinite",
              }} />
              <style>{`@keyframes perennial-import-spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Importing {validRowCount} contact{validRowCount === 1 ? "" : "s"}…
              </p>
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === "done" && (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "rgba(155,163,122,0.16)",
                margin: "0 auto 12px",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--color-sage)",
              }}>
                <Check size={20} strokeWidth={2} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
                Imported {importedCount} contact{importedCount === 1 ? "" : "s"}
              </p>
              {skippedCount > 0 && (
                <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {skippedCount} row{skippedCount === 1 ? "" : "s"} skipped — no name.
                </p>
              )}
              {importError && (
                <p style={{ fontSize: 11, color: "var(--color-red-orange)", marginTop: 8 }}>
                  {importError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", borderTop: "0.5px solid var(--color-border)",
          flexShrink: 0,
        }}>
          {step === "file"      && <span />}
          {step === "map"       && <Button variant="ghost" size="sm" onClick={() => setStep("file")}>← Back</Button>}
          {step === "preview"   && <Button variant="ghost" size="sm" onClick={() => setStep("map")}>← Back</Button>}
          {(step === "importing" || step === "done") && <span />}

          {step === "file" && (
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          )}
          {step === "map" && (
            <Button
              variant="primary" size="sm"
              disabled={!hasNameMapping}
              onClick={() => setStep("preview")}
            >
              Review {validRowCount} contact{validRowCount === 1 ? "" : "s"} →
            </Button>
          )}
          {step === "preview" && (
            <Button
              variant="primary" size="sm"
              disabled={validRowCount === 0}
              onClick={runImport}
            >
              Import {validRowCount} contact{validRowCount === 1 ? "" : "s"}
            </Button>
          )}
          {step === "done" && (
            <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Row → contact payload ────────────────────────────────────────────────────

interface MappedContact {
  first_name:   string;
  last_name:    string;
  email:        string;
  phone:        string;
  company_name: string;
  title:        string;
  location:     string;
  website:      string;
  tags:         string[];
  is_lead:      boolean;
}

function buildContactPayload(row: string[], _headers: string[], mapping: FieldKey[]): MappedContact {
  const out: MappedContact = {
    first_name: "", last_name: "", email: "", phone: "",
    company_name: "", title: "", location: "", website: "",
    tags: [], is_lead: false,
  };
  mapping.forEach((field, idx) => {
    const raw = (row[idx] ?? "").trim();
    if (!raw) return;
    switch (field) {
      case "first_name": out.first_name = raw; break;
      case "last_name":  out.last_name  = raw; break;
      case "full_name": {
        const { first, last } = splitFullName(raw);
        if (!out.first_name) out.first_name = first;
        if (!out.last_name)  out.last_name  = last;
        break;
      }
      case "email":      out.email     = raw; break;
      case "phone":      out.phone     = raw; break;
      case "company":    out.company_name = raw; break;
      case "title":      out.title     = raw; break;
      case "location":   out.location  = raw; break;
      case "website":    out.website   = raw; break;
      case "tags":       out.tags      = parseTags(raw); break;
      case "is_lead":    out.is_lead   = parseLeadFlag(raw); break;
      case "_ignore":    break;
    }
  });
  return out;
}

function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
