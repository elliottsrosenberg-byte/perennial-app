<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Rich text

Inline images: any surface using `getRichExtensions` gets paste/drop/picker
uploads to the `editor_images` storage bucket. Max 10 MB, JPEG/PNG/GIF/WebP/SVG.
Objects are owner-namespaced under `${userId}/...` and publicly readable. The
upload helper lives at `lib/uploads/editor-image.ts`. The Notes Import flow
(`components/notes/ImportNoteModal.tsx`) reuses the same helper to bring
embedded PDF/DOCX images in alongside text.
