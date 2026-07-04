// List the user's uploaded images (the owner-namespaced editor_images bucket —
// shared by canvas, notes, and detail-panel uploads) for the "image from files"
// picker. NOTE: this is the user's image library; deeper per-entity file
// integration (Resources) is a follow-up.

import { createClient } from "@/lib/supabase/client";
import { EDITOR_IMAGE_BUCKET } from "@/lib/uploads/editor-image";

const IMG_EXT = /\.(jpe?g|png|gif|webp|svg)$/i;

export interface LibraryImage {
  url: string;
  path: string;
  name: string;
}

export async function listUserImages(): Promise<LibraryImage[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.storage
    .from(EDITOR_IMAGE_BUCKET)
    .list(user.id, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return [];

  return data
    .filter((f) => f.id && IMG_EXT.test(f.name))
    .map((f) => {
      const path = `${user.id}/${f.name}`;
      const { data: pub } = supabase.storage.from(EDITOR_IMAGE_BUCKET).getPublicUrl(path);
      return { url: pub.publicUrl, path, name: f.name };
    });
}
