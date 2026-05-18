// Inline-image upload pipeline for the shared RichEditor.
//
// Every rich-text surface in the app (notes, project/contact/outreach
// canvases) goes through this helper for paste, drop, and toolbar-picker
// uploads. Objects live in the public `editor_images` bucket, namespaced
// under the uploader's user id so RLS can enforce ownership on writes
// while public read keeps <img src> trivially renderable.

import { createClient } from "@/lib/supabase/client";

export const EDITOR_IMAGE_BUCKET = "editor_images";
export const EDITOR_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg":    "jpg",
  "image/jpg":     "jpg",
  "image/png":     "png",
  "image/gif":     "gif",
  "image/webp":    "webp",
  "image/svg+xml": "svg",
};

export interface UploadedEditorImage {
  url:     string;
  path:    string;
  width?:  number;
  height?: number;
}

export interface UploadEditorImageOptions {
  onProgress?: (pct: number) => void;
}

export function isUploadableImageType(type: string): boolean {
  return ALLOWED_TYPES.has(type);
}

function slugifyFilename(name: string): string {
  // Strip extension, lowercase, replace non-[a-z0-9] runs with "-".
  const base = name.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return slug || "image";
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for ancient runtimes — unlikely in our browser-targeted flow.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  // SVG has no intrinsic raster dimensions and the Image() probe can be
  // flaky for some SVGs — skip and let the editor render at natural size.
  if (file.type === "image/svg+xml") return {};
  if (typeof window === "undefined") return {};
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

export async function uploadEditorImage(
  file: File,
  opts: UploadEditorImageOptions = {},
): Promise<UploadedEditorImage> {
  if (!isUploadableImageType(file.type)) {
    throw new Error(
      `Unsupported image type "${file.type || "unknown"}". Use JPEG, PNG, GIF, WebP, or SVG.`,
    );
  }
  if (file.size > EDITOR_IMAGE_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Image is ${mb} MB. Max is ${EDITOR_IMAGE_MAX_BYTES / (1024 * 1024)} MB — try resizing first.`,
    );
  }

  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("You must be signed in to upload images.");

  const ext  = EXT_BY_TYPE[file.type] ?? "bin";
  const slug = slugifyFilename(file.name || `image.${ext}`);
  const path = `${user.id}/${uuid()}-${slug}.${ext}`;

  // The supabase-js storage client doesn't surface granular progress; we
  // report 0 → 100 around the upload so callers can drive a spinner.
  opts.onProgress?.(0);

  const { error: uploadErr } = await supabase
    .storage
    .from(EDITOR_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType:  file.type,
      upsert:       false,
    });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: pub } = supabase
    .storage
    .from(EDITOR_IMAGE_BUCKET)
    .getPublicUrl(path);

  const dims = await readImageDimensions(file);
  opts.onProgress?.(100);

  return { url: pub.publicUrl, path, ...dims };
}

export type EditorImageUploader = typeof uploadEditorImage;
