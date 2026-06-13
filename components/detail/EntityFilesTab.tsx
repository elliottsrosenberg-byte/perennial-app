"use client";

// ── EntityFilesTab ────────────────────────────────────────────────────────────
// Entity-agnostic Files tab, extracted from ProjectDetailPanel's FilesTab.
// Per-entity differences: the files TABLE the row lives in, the foreign-key
// column, the storage bucket, and the storage object path. Empty-state hint copy
// is overridable.
//
// Behavior reproduced EXACTLY from the Project version: Upload file / Add link
// toolbar, link form, file list with icon + size + open + delete, optimistic
// insert + delete.

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { FolderOpen, Trash2, Plus, Link2, ExternalLink } from "lucide-react";

export type FilesTable = "project_files" | "contact_files" | "organization_files" | "target_files";
export type FileFkColumn = "project_id" | "contact_id" | "organization_id" | "target_id";

interface EntityFile {
  id:         string;
  user_id:    string;
  name:       string;
  url:        string;
  file_type:  string | null;
  size_bytes: number | null;
  created_at: string;
  [key: string]: unknown;
}

type AddMode = "upload" | "link" | null;

export default function EntityFilesTab({
  filesTable, fkColumn, id,
  bucket = "project-files",
  buildStoragePath,
  emptyHint = "Upload images, PDFs, and documents, or add links to external files",
}: {
  filesTable: FilesTable;
  fkColumn:   FileFkColumn;
  id:         string;
  /** Storage bucket name. Defaults to project-files. */
  bucket?:    string;
  /** Builds the storage object path for an upload. Defaults to the Project
   *  pattern (`${id}/${ts}_${name}`). Pass a builder to mirror the
   *  owner-namespaced pattern Contact/Org/Target use. */
  buildStoragePath?: (args: { userId: string; id: string; fileName: string }) => string;
  emptyHint?: string;
}) {
  const [files,     setFiles]     = useState<EntityFile[]>([]);
  const [addMode,   setAddMode]   = useState<AddMode>(null);
  const [newName,   setNewName]   = useState("");
  const [newUrl,    setNewUrl]    = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient().from(filesTable).select("*").eq(fkColumn, id).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setFiles(data as EntityFile[]); setLoading(false); });
  }, [filesTable, fkColumn, id]);

  async function saveToDb(name: string, url: string, fileType: string | null, sizeBytes: number | null) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from(filesTable)
      .insert({ [fkColumn]: id, user_id: user.id, name, url, file_type: fileType, size_bytes: sizeBytes })
      .select().single();
    if (data) setFiles(prev => [data as EntityFile, ...prev]);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext  = file.name.split(".").pop()?.toLowerCase() ?? "";
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = buildStoragePath
        ? buildStoragePath({ userId: user.id, id, fileName: safeName })
        : `${id}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      await saveToDb(file.name, urlData.publicUrl, ext, file.size);
    } finally {
      setUploading(false);
      setAddMode(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function addLink() {
    if (!newName.trim() || !newUrl.trim()) return;
    const ext = newUrl.split(".").pop()?.toLowerCase().split("?")[0] ?? null;
    await saveToDb(newName.trim(), newUrl.trim(), ext, null);
    setNewName(""); setNewUrl(""); setAddMode(null);
  }

  async function deleteFile(fileId: string) {
    await createClient().from(filesTable).delete().eq("id", fileId);
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }

  function fileIcon(type: string | null) {
    if (!type) return <Link2 size={14} strokeWidth={1.5} style={{ color: "var(--color-grey)" }} />;
    if (["jpg","jpeg","png","gif","webp","svg"].includes(type)) return <span style={{ fontSize: 14 }}>🖼</span>;
    if (type === "pdf") return <span style={{ fontSize: 14 }}>📄</span>;
    if (["doc","docx"].includes(type)) return <span style={{ fontSize: 14 }}>📝</span>;
    if (["xls","xlsx"].includes(type)) return <span style={{ fontSize: 14 }}>📊</span>;
    return <FolderOpen size={14} strokeWidth={1.5} style={{ color: "var(--color-grey)" }} />;
  }

  function fmtSize(bytes: number | null) {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <input
          ref={fileInputRef} type="file" style={{ display: "none" }}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => { setAddMode(addMode === "upload" ? null : "upload"); fileInputRef.current?.click(); }}
          disabled={uploading}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit", opacity: uploading ? 0.6 : 1 }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <Plus size={12} strokeWidth={2} />
          {uploading ? "Uploading…" : "Upload file"}
        </button>
        <button
          onClick={() => setAddMode(m => m === "link" ? null : "link")}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: addMode === "link" ? "var(--color-surface-sunken)" : "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit" }}
          onMouseEnter={e => { if (addMode !== "link") e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
          onMouseLeave={e => { if (addMode !== "link") e.currentTarget.style.background = "transparent"; }}
        >
          <Link2 size={12} strokeWidth={2} />
          Add link
        </button>
      </div>

      {/* Link form */}
      {addMode === "link" && (
        <div style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, background: "var(--color-surface-sunken)" }}>
          <input
            autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Name (e.g. Brief v2)"
            style={{ fontSize: 12, padding: "5px 9px", border: "0.5px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface-raised)", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }}
          />
          <input
            value={newUrl} onChange={e => setNewUrl(e.target.value)}
            placeholder="URL — Google Drive, Dropbox, Figma…"
            onKeyDown={e => { if (e.key === "Enter") addLink(); if (e.key === "Escape") { setAddMode(null); setNewName(""); setNewUrl(""); } }}
            style={{ fontSize: 12, padding: "5px 9px", border: "0.5px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface-raised)", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addLink} style={{ fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer" }}>Save</button>
            <button onClick={() => { setAddMode(null); setNewName(""); setNewUrl(""); }} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, background: "transparent", border: "0.5px solid var(--color-border)", cursor: "pointer", color: "var(--color-grey)", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {loading && <p style={{ fontSize: 12, color: "var(--color-grey)" }}>Loading…</p>}
        {!loading && files.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 6, color: "var(--color-grey)" }}>
            <FolderOpen size={28} strokeWidth={1.25} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 12 }}>No files yet</p>
            <p style={{ fontSize: 11, textAlign: "center", maxWidth: 200, lineHeight: 1.5 }}>{emptyHint}</p>
          </div>
        )}
        {files.map(file => (
          <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 6, borderRadius: 9, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
            <span style={{ flexShrink: 0, width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>{fileIcon(file.file_type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
              <p style={{ fontSize: 10, color: "var(--color-grey)" }}>
                {file.file_type?.toUpperCase()}{file.size_bytes ? ` · ${fmtSize(file.size_bytes)}` : ""}
              </p>
            </div>
            <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-grey)", display: "flex", flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--color-charcoal)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--color-grey)")}
            >
              <ExternalLink size={13} strokeWidth={1.75} />
            </a>
            <button
              onClick={() => deleteFile(file.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-grey)", padding: 0, display: "flex", flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
