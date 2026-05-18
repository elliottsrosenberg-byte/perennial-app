"use client";

// File → note import flow.
//
// All parsing happens client-side — these files may be sensitive (private
// drafts, meeting notes, client correspondence) and we never want raw
// document bytes to touch a server we don't need them to.
//
// Supported extensions:
//   .txt        → File.text()
//   .pdf        → pdfjs-dist, page-by-page text extraction joined by \n\n
//   .docx       → mammoth.convertToHtml() (preserves headings, bold, lists)
//   .doc        → unsupported; surface a clear error pointing at .docx/.txt
//
// After parsing the user gets a preview with an editable title (defaults
// to the filename without extension) and a body preview. Confirming
// inserts via the same path NotesClient.createNote uses, then re-fires
// the `notes:created` event so the tour and "freshly opened" UX still
// trigger.

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note } from "@/types/database";
import { X, Upload, FileText, Check } from "lucide-react";
import Button from "@/components/ui/Button";

type Step = "file" | "preview" | "importing" | "done";

interface Props {
  onClose:    () => void;
  /** Called after a note is inserted. Receives the newly created Note so
   *  the parent can prepend it to its list and select it. */
  onImported: (note: Note) => void;
}

// ─── Parsers (all client-side) ─────────────────────────────────────────────

async function parseTxt(file: File): Promise<string> {
  const raw = await file.text();
  // Plain text → wrap each paragraph in <p> so the rich editor renders
  // it sensibly. Split on blank-line boundaries; collapse single newlines
  // inside a paragraph into spaces.
  const paras = raw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p.replace(/\n/g, " "))}</p>`);
  return paras.join("");
}

async function parsePdf(file: File): Promise<string> {
  // Lazy-load pdfjs only when needed so it doesn't pull a few hundred KB
  // into the main bundle for users who never import a PDF.
  const pdfjs = await import("pdfjs-dist");
  // Worker setup: ship the bundled worker via a blob URL so we don't have
  // to copy worker assets into /public. This works for files of any size
  // we expect a notes import to handle (tens of MB max).
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as string).catch(() => null);
    if (workerModule && (workerModule as { default: string }).default) {
      pdfjs.GlobalWorkerOptions.workerSrc = (workerModule as { default: string }).default;
    } else {
      // Fallback to the unpkg CDN matching the installed version. This
      // keeps imports working even when the bundler can't resolve the
      // worker via the ?url import above.
      const version = (pdfjs as unknown as { version: string }).version;
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
    }
  }

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    type Item = { str?: string; hasEOL?: boolean };
    const text = (content.items as Item[])
      .map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : ""))
      .join("");
    pageTexts.push(text.trim());
  }
  // Wrap each page's paragraphs in <p>.
  const all = pageTexts.join("\n\n");
  const paras = all
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p.replace(/\n/g, " "))}</p>`);
  return paras.join("");
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser.js" as string).catch(() => import("mammoth"));
  const buf = await file.arrayBuffer();
  // convertToHtml preserves headings, bold, italics, and list structure
  // — exactly what the TipTap editor knows how to render.
  const result = await (mammoth as { convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> })
    .convertToHtml({ arrayBuffer: buf });
  return cleanupHtml(result.value);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanupHtml(html: string): string {
  // Collapse runs of empty paragraphs that mammoth often emits for
  // blank lines between sections in Word docs.
  return html
    .replace(/(<p>\s*<\/p>\s*){2,}/g, "<p></p>")
    .replace(/^\s+|\s+$/g, "");
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "Untitled";
}

function getExtension(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ImportNoteModal({ onClose, onImported }: Props) {
  const [step,       setStep]       = useState<Step>("file");
  const [parseError, setParseError] = useState<string | null>(null);
  const [filename,   setFilename]   = useState<string | null>(null);
  const [title,      setTitle]      = useState("");
  const [bodyHtml,   setBodyHtml]   = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setParseError(null);
    setFilename(file.name);
    const ext = getExtension(file.name);

    if (ext === "doc") {
      setParseError("We can't parse legacy .doc files yet. Open the file in Word or Google Docs and save it as .docx (or export as .txt), then try again.");
      return;
    }
    if (ext !== "txt" && ext !== "pdf" && ext !== "docx") {
      setParseError("Unsupported file type. Drop a .txt, .pdf, or .docx file.");
      return;
    }

    try {
      const html =
        ext === "txt"  ? await parseTxt(file)  :
        ext === "pdf"  ? await parsePdf(file)  :
                         await parseDocx(file);
      if (!html || !html.replace(/<[^>]*>/g, "").trim()) {
        setParseError("We couldn't pull any text out of that file. It may be image-only (e.g. a scanned PDF) or empty.");
        return;
      }
      setTitle(stripExtension(file.name));
      setBodyHtml(html);
      setStep("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(`Couldn't parse this file: ${msg}`);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

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

    const { data, error } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        title:   title.trim() || null,
        content: bodyHtml || null,
      })
      .select("*, project:projects(id,title), contact:contacts(id,first_name,last_name), opportunity:opportunities(id,title,category)")
      .single();

    if (error || !data) {
      setImportError(error?.message ?? "Couldn't create note.");
      setStep("preview");
      return;
    }

    const note = data as Note;
    onImported(note);
    // Mirror createNote's event — keeps the tour advance and the
    // "freshly opened" behaviour consistent between manual and imported
    // notes.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notes:created", {
        detail: { id: note.id, title: note.title ?? "" },
      }));
    }
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
              Import note
            </h2>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              {step === "file"      && "Drop a .txt, .pdf, or .docx file. Parsing happens in your browser — the file never leaves your device until you confirm."}
              {step === "preview"   && "Review the title and a preview of the imported text, then bring it in as a note."}
              {step === "importing" && "Saving the note…"}
              {step === "done"      && "Note imported."}
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
          {(["file", "preview"] as Step[]).map((s, i) => {
            const order: Record<Step, number> = { file: 0, preview: 1, importing: 2, done: 2 };
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
                accept=".txt,.pdf,.doc,.docx,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                  Drop a file or click to choose
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  .txt · .pdf · .docx
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
                  What gets imported
                </p>
                <ul style={{ fontSize: 11, lineHeight: 1.6, color: "var(--color-text-secondary)", paddingLeft: 16, listStyle: "disc" }}>
                  <li><strong>.txt</strong> · plain text, paragraph-by-paragraph</li>
                  <li><strong>.pdf</strong> · extracted text; image-only PDFs won&apos;t produce content</li>
                  <li><strong>.docx</strong> · text plus basic formatting (headings, bold, lists)</li>
                  <li>Legacy <strong>.doc</strong> isn&apos;t supported — save as .docx or .txt first</li>
                </ul>
              </div>
            </>
          )}

          {/* ── Step 2: Preview ── */}
          {step === "preview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                background: "var(--color-surface-sunken)", borderRadius: 8,
                fontSize: 11, color: "var(--color-text-secondary)",
              }}>
                <FileText size={13} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)" }} />
                <span style={{ flex: 1, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {filename}
                </span>
              </div>

              <div>
                <label style={{
                  display: "block",
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--color-text-tertiary)",
                  marginBottom: 6,
                }}>
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled"
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 7,
                    background: "var(--color-surface-sunken)",
                    border: "0.5px solid var(--color-border)",
                    fontSize: 13, color: "var(--color-text-primary)",
                    fontFamily: "inherit", outline: "none",
                  }}
                />
              </div>

              <div>
                <p style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--color-text-tertiary)",
                  marginBottom: 6,
                }}>
                  Preview
                </p>
                <div
                  style={{
                    padding: "12px 14px", borderRadius: 8,
                    background: "var(--color-off-white)",
                    border: "0.5px solid var(--color-border)",
                    maxHeight: 280, overflowY: "auto",
                    fontSize: 12, lineHeight: 1.55, color: "var(--color-text-primary)",
                  }}
                  // The HTML here is produced by our own parsers from
                  // text content — mammoth strips scripts, our .txt/.pdf
                  // paths escape and then re-wrap in <p>. Safe to render.
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
              </div>

              {importError && (
                <p style={{ fontSize: 12, color: "var(--color-red-orange)" }}>
                  {importError}
                </p>
              )}
            </div>
          )}

          {/* ── Step 3: Importing ── */}
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
                Saving the note…
              </p>
            </div>
          )}

          {/* ── Step 4: Done ── */}
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
                Note imported
              </p>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                Opened in the editor — keep going or come back to it later.
              </p>
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
          {step === "preview"   && <Button variant="ghost" size="sm" onClick={() => { setStep("file"); setBodyHtml(""); setTitle(""); }}>← Back</Button>}
          {(step === "importing" || step === "done") && <span />}

          {step === "file" && (
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          )}
          {step === "preview" && (
            <Button variant="primary" size="sm" onClick={runImport}>
              Import as note
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
