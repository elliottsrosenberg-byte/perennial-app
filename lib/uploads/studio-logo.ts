// Studio-logo upload pipeline. Mirrors lib/uploads/editor-image.ts but
// targets the dedicated `studio-logos` bucket (smaller cap, narrower
// type allow-list) so the Settings "Invoice & studio identity" form
// and any future invoice-themable surface share a single helper.
//
// Bucket is configured public-read with RLS scoped to `${auth.uid()}/...`
// so the rendered invoice (and the public /i/[token] view) can pull
// the logo via a plain <img src>.

import { createClient } from "@/lib/supabase/client";

export const STUDIO_LOGO_BUCKET = "studio-logos";
export const STUDIO_LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg":    "jpg",
  "image/jpg":     "jpg",
  "image/png":     "png",
  "image/webp":    "webp",
  "image/svg+xml": "svg",
};

export interface UploadedStudioLogo {
  url:  string;
  path: string;
}

export function isUploadableLogoType(type: string): boolean {
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
  return slug || "logo";
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadStudioLogo(file: File): Promise<UploadedStudioLogo> {
  if (!isUploadableLogoType(file.type)) {
    throw new Error(
      `Unsupported logo type "${file.type || "unknown"}". Use JPEG, PNG, WebP, or SVG.`,
    );
  }
  if (file.size > STUDIO_LOGO_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Logo is ${mb} MB. Max is ${STUDIO_LOGO_MAX_BYTES / (1024 * 1024)} MB — try a smaller image.`,
    );
  }

  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("You must be signed in to upload a logo.");

  const ext  = EXT_BY_TYPE[file.type] ?? "bin";
  const slug = slugifyFilename(file.name || `logo.${ext}`);
  const path = `${user.id}/${uuid()}-${slug}.${ext}`;

  const { error: uploadErr } = await supabase
    .storage
    .from(STUDIO_LOGO_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType:  file.type,
      upsert:       false,
    });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: pub } = supabase
    .storage
    .from(STUDIO_LOGO_BUCKET)
    .getPublicUrl(path);

  return { url: pub.publicUrl, path };
}

/** Best-effort delete of a previously uploaded logo. Errors are swallowed
 *  so a stale path doesn't block the user from updating their profile —
 *  worst case the orphan stays in the bucket until cleaned up server-side. */
export async function deleteStudioLogo(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const supabase = createClient();
  await supabase.storage.from(STUDIO_LOGO_BUCKET).remove([path]);
}
