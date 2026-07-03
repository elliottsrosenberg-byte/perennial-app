"use client";

// File → note import flow.
//
// All parsing happens client-side — these files may be sensitive (private
// drafts, meeting notes, client correspondence) and we never want raw
// document bytes to touch a server we don't need them to.
//
// Supported extensions:
//   .txt        → File.text()
//   .pdf        → pdfjs-dist text extraction + image XObject extraction;
//                 images are uploaded to the editor_images bucket and
//                 appended after each page's text (v1 trade-off — no
//                 transform-matrix-based inline positioning yet).
//   .docx       → mammoth.convertToHtml(); inline images are routed
//                 through the same upload helper via convertImage.
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
import Modal from "@/components/ui/Modal";
import { uploadEditorImage } from "@/lib/uploads/editor-image";

type Step = "file" | "parsing" | "preview" | "importing" | "done";

interface ParseProgress {
  phase:       string;
  pagesDone?:  number;
  pagesTotal?: number;
  imagesDone?: number;
}

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

async function parsePdf(file: File, onProgress?: (p: ParseProgress) => void): Promise<string> {
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
  // pdfjs-dist's OPS enum lets us spot paintImageXObject without baking
  // in a magic number. Fall back to the canonical opcode values if it's
  // not exported in this build.
  const OPS = (pdfjs as unknown as { OPS?: Record<string, number> }).OPS ?? {};
  const PAINT_IMAGE  = OPS.paintImageXObject       ?? 85;
  const PAINT_INLINE = OPS.paintInlineImageXObject ?? 86;

  const pageBlocks: string[] = [];
  let imagesDone = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({ phase: `Reading page ${i} of ${pdf.numPages}`, pagesDone: i - 1, pagesTotal: pdf.numPages, imagesDone });
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    type Item = { str?: string; hasEOL?: boolean };
    const text = (content.items as Item[])
      .map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : ""))
      .join("");
    const textParas = text.trim()
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p.replace(/\n/g, " "))}</p>`)
      .join("");

    // v1 trade-off: rather than mapping each paintImageXObject's
    // transform matrix back to a precise text-insertion point, we extract
    // every image on the page and append them after the page's text.
    // Keeps reading order roughly right (prose first, figures after) at a
    // fraction of the complexity.
    let pageImagesHtml = "";
    try {
      const opList = await page.getOperatorList();
      const fns:  number[]    = opList.fnArray   as unknown as number[];
      const args: unknown[][] = opList.argsArray as unknown as unknown[][];
      for (let opIdx = 0; opIdx < fns.length; opIdx++) {
        const fn = fns[opIdx];
        if (fn !== PAINT_IMAGE && fn !== PAINT_INLINE) continue;
        const a = args[opIdx];
        const name = Array.isArray(a) ? (a[0] as string | undefined) : undefined;
        if (!name) continue;
        try {
          const imgObj = await new Promise<unknown>((resolve) => {
            try {
              const objs = page.objs as unknown as {
                get: (n: string, cb?: (v: unknown) => void) => unknown;
              };
              const v = objs.get(name, resolve);
              if (v !== undefined && v !== null) resolve(v);
            } catch { resolve(null); }
          });
          const dataUrl = imageObjectToPngDataUrl(imgObj);
          if (!dataUrl) continue;
          const blob = await (await fetch(dataUrl)).blob();
          const f = new File([blob], `pdf-page${i}-${opIdx}.png`, { type: "image/png" });
          const { url } = await uploadEditorImage(f);
          imagesDone += 1;
          onProgress?.({ phase: `Uploading images from page ${i}`, pagesDone: i - 1, pagesTotal: pdf.numPages, imagesDone });
          pageImagesHtml += `<p><img src="${escapeAttr(url)}" alt="" /></p>`;
        } catch {
          // Skip individual image failures so one bad XObject doesn't
          // sink the whole import.
        }
      }
    } catch {
      // Operator-list extraction can throw on encrypted / oddly-built
      // PDFs. Land the text we have and move on.
    }

    pageBlocks.push(textParas + pageImagesHtml);
  }
  onProgress?.({ phase: "Finishing PDF", pagesDone: pdf.numPages, pagesTotal: pdf.numPages, imagesDone });
  return pageBlocks.join("");
}

interface PdfImageObject {
  width?:  number;
  height?: number;
  data?:   Uint8ClampedArray | Uint8Array | number[];
  bitmap?: ImageBitmap;
  kind?:   number;
}

function imageObjectToPngDataUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as PdfImageObject;
  if (typeof document === "undefined") return null;

  // Modern pdfjs hands us a pre-decoded ImageBitmap — fastest path.
  if (o.bitmap && typeof o.bitmap.width === "number") {
    const c = document.createElement("canvas");
    c.width = o.bitmap.width; c.height = o.bitmap.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(o.bitmap, 0, 0);
    return c.toDataURL("image/png");
  }

  if (!o.data || !o.width || !o.height) return null;
  const w = o.width, h = o.height;
  const src = o.data as ArrayLike<number>;
  const out = new Uint8ClampedArray(w * h * 4);
  // pdfjs ImageKind: 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP.
  // We detect by length when `kind` isn't set.
  try {
    if (o.kind === 3 || src.length === w * h * 4) {
      for (let i = 0; i < out.length; i++) out[i] = src[i];
    } else if (o.kind === 2 || src.length === w * h * 3) {
      for (let p = 0, q = 0; p < src.length; p += 3, q += 4) {
        out[q] = src[p]; out[q + 1] = src[p + 1]; out[q + 2] = src[p + 2]; out[q + 3] = 255;
      }
    } else if (src.length === w * h) {
      for (let p = 0, q = 0; p < src.length; p++, q += 4) {
        const v = src[p]; out[q] = v; out[q + 1] = v; out[q + 2] = v; out[q + 3] = 255;
      }
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  return c.toDataURL("image/png");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function parseDocx(file: File, onProgress?: (p: ParseProgress) => void): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser.js" as string).catch(() => import("mammoth"));
  const buf = await file.arrayBuffer();

  let imagesDone = 0;
  onProgress?.({ phase: "Reading document", imagesDone });

  type MammothImage = {
    contentType: string;
    read:        (encoding?: string) => Promise<ArrayBuffer | Uint8Array>;
  };
  type MammothImagesNS = {
    imgElement: (handler: (image: MammothImage) => Promise<{ src: string }>) => unknown;
  };
  type MammothModule = {
    images:        MammothImagesNS;
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }, opts?: { convertImage?: unknown }) => Promise<{ value: string }>;
  };
  const m = mammoth as unknown as MammothModule;

  const result = await m.convertToHtml(
    { arrayBuffer: buf },
    {
      convertImage: m.images.imgElement(async (image: MammothImage) => {
        try {
          const raw = await image.read();
          const buffer = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
          const type   = image.contentType || "image/png";
          const ext    = type.split("/")[1]?.replace("+xml", "") || "png";
          const blob   = new Blob([buffer as BlobPart], { type });
          const f      = new File([blob], `docx-image-${Date.now()}-${imagesDone}.${ext}`, { type });
          const { url } = await uploadEditorImage(f);
          imagesDone += 1;
          onProgress?.({ phase: "Uploading images", imagesDone });
          return { src: url };
        } catch {
          // Empty src — Tiptap will drop the node on parse, which is the
          // right behaviour for a broken upload.
          return { src: "" };
        }
      }),
    },
  );
  onProgress?.({ phase: "Finishing document", imagesDone });
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
  const [progress,   setProgress]   = useState<ParseProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setParseError(null);
    setFilename(file.name);
    setProgress(null);
    const ext = getExtension(file.name);

    if (ext === "doc") {
      setParseError("We can't parse legacy .doc files yet. Open the file in Word or Google Docs and save it as .docx (or export as .txt), then try again.");
      return;
    }
    if (ext !== "txt" && ext !== "pdf" && ext !== "docx") {
      setParseError("Unsupported file type. Drop a .txt, .pdf, or .docx file.");
      return;
    }

    setStep("parsing");
    try {
      const html =
        ext === "txt"  ? await parseTxt(file)             :
        ext === "pdf"  ? await parsePdf(file,  setProgress) :
                         await parseDocx(file, setProgress);
      if (!html || !html.replace(/<[^>]*>/g, "").trim()) {
        setParseError("We couldn't pull any text out of that file. It may be image-only (e.g. a scanned PDF) or empty.");
        setStep("file");
        return;
      }
      setTitle(stripExtension(file.name));
      setBodyHtml(html);
      setStep("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(`Couldn't parse this file: ${msg}`);
      setStep("file");
    } finally {
      setProgress(null);
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
    <Modal
      onClose={onClose}
      maxWidth={560}
      bodyStyle={{ padding: "16px 18px 18px" }}
      header={
        <>
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
              {step === "file"      && "Drop a .txt, .pdf, or .docx file. Parsing happens in your browser — only embedded images are uploaded as you go."}
              {step === "parsing"   && "Parsing the file…"}
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
            const order: Record<Step, number> = { file: 0, parsing: 0.5, preview: 1, importing: 2, done: 2 };
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
        </>
      }
      footer={
        <div className="flex flex-1 items-center justify-between">
          {step === "file"      && <span />}
          {step === "parsing"   && <span />}
          {step === "preview"   && <Button variant="ghost" size="sm" onClick={() => { setStep("file"); setBodyHtml(""); setTitle(""); }}>← Back</Button>}
          {(step === "importing" || step === "done") && <span />}

          {step === "file" && (
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          )}
          {step === "parsing" && (
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
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
      }
    >
        {/* Body */}

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
                  <li><strong>.pdf</strong> · extracted text plus embedded images (appended after each page&apos;s text)</li>
                  <li><strong>.docx</strong> · text, headings, lists, and inline images</li>
                  <li>Legacy <strong>.doc</strong> isn&apos;t supported — save as .docx or .txt first</li>
                </ul>
              </div>
            </>
          )}

          {/* ── Step 1.5: Parsing ── */}
          {step === "parsing" && (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <div style={{
                width: 38, height: 38, borderRadius: "50%",
                border: "2px solid var(--color-border)", borderTopColor: "var(--color-sage)",
                margin: "0 auto 14px",
                animation: "perennial-import-spin 0.8s linear infinite",
              }} />
              <style>{`@keyframes perennial-import-spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                {progress?.phase ?? "Parsing the file…"}
              </p>
              {(progress?.pagesTotal || progress?.imagesDone) && (
                <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 6 }}>
                  {progress?.pagesTotal && progress?.pagesDone != null && (
                    <span>{progress.pagesDone} / {progress.pagesTotal} pages</span>
                  )}
                  {progress?.pagesTotal && progress?.imagesDone ? <span> · </span> : null}
                  {progress?.imagesDone ? (
                    <span>{progress.imagesDone} image{progress.imagesDone === 1 ? "" : "s"} uploaded</span>
                  ) : null}
                </p>
              )}
              <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 10 }}>
                {filename}
              </p>
            </div>
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
                <style>{`.perennial-import-preview img { max-width: 100%; height: auto; border-radius: 4px; margin: 6px 0; }`}</style>
                <div
                  className="perennial-import-preview"
                  style={{
                    padding: "12px 14px", borderRadius: 8,
                    background: "var(--color-off-white)",
                    border: "0.5px solid var(--color-border)",
                    maxHeight: 280, overflowY: "auto",
                    fontSize: 12, lineHeight: 1.55, color: "var(--color-text-primary)",
                  }}
                  // The HTML here is produced by our own parsers from
                  // text content + uploaded image URLs — mammoth strips
                  // scripts, our .txt/.pdf paths escape and then re-wrap
                  // in <p>. Safe to render.
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
    </Modal>
  );
}
