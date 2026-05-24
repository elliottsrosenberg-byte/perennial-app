// Receipt upload pipeline for Banking-tab transactions.
//
// Mirrors lib/uploads/editor-image.ts but pointed at the `receipts`
// bucket and broadened to accept PDFs alongside common raster image
// formats. Objects are owner-namespaced under `${userId}/...` so the
// bucket's RLS policies (owner-scoped writes + public read) can scope
// writes by uploader while keeping the resulting URL trivially
// renderable in the UI.

import { createClient } from "@/lib/supabase/client";

export const RECEIPT_BUCKET = "receipts";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg":      "jpg",
  "image/jpg":       "jpg",
  "image/png":       "png",
  "image/gif":       "gif",
  "image/webp":      "webp",
  "application/pdf": "pdf",
};

export interface UploadedReceipt {
  url:  string;
  path: string;
  /** echo of file.type for the caller's UI ("image/..." vs "application/pdf") */
  type: string;
  name: string;
}

export function isUploadableReceiptType(type: string): boolean {
  return ALLOWED_TYPES.has(type);
}

function slugifyFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return slug || "receipt";
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadReceipt(file: File): Promise<UploadedReceipt> {
  if (!isUploadableReceiptType(file.type)) {
    throw new Error(
      `Unsupported receipt type "${file.type || "unknown"}". Use JPEG, PNG, GIF, WebP, or PDF.`,
    );
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Receipt is ${mb} MB. Max is ${RECEIPT_MAX_BYTES / (1024 * 1024)} MB — try a smaller file.`,
    );
  }

  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("You must be signed in to upload receipts.");

  const ext  = EXT_BY_TYPE[file.type] ?? "bin";
  const slug = slugifyFilename(file.name || `receipt.${ext}`);
  const path = `${user.id}/${uuid()}-${slug}.${ext}`;

  const { error: uploadErr } = await supabase
    .storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType:  file.type,
      upsert:       false,
    });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: pub } = supabase
    .storage
    .from(RECEIPT_BUCKET)
    .getPublicUrl(path);

  return {
    url:  pub.publicUrl,
    path,
    type: file.type,
    name: file.name,
  };
}

export async function deleteReceipt(path: string): Promise<void> {
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
  if (error) throw new Error(`Receipt delete failed: ${error.message}`);
}
