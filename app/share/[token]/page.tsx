import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

// Anon client — RLS policy allows SELECT on shared notes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

async function getSharedNote(token: string) {
  const { data } = await supabase
    .from("notes")
    .select("id, title, content, updated_at")
    .eq("share_token", token)
    .single();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const note = await getSharedNote(token);
  return {
    title: note?.title ? `${note.title} — Perennial` : "Shared note — Perennial",
  };
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function SharedNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const note = await getSharedNote(token);
  if (!note) notFound();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,700;1,6..72,400&family=Albert+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Albert Sans', system-ui, sans-serif; background: #f9faf4; color: #1f211a; min-height: 100vh; }
          a { color: #5a7040; }
          .prose h1 { font-family: 'Newsreader', serif; font-size: 2em; font-weight: 700; line-height: 1.25; margin: 0.6em 0 0.3em; }
          .prose h2 { font-size: 1.35em; font-weight: 600; line-height: 1.35; margin: 0.5em 0 0.25em; }
          .prose p  { margin: 0 0 0.6em; line-height: 1.75; }
          .prose ul { list-style-type: disc; padding-left: 1.5em; margin: 0.4em 0 0.8em; }
          .prose ol { list-style-type: decimal; padding-left: 1.5em; margin: 0.4em 0 0.8em; }
          .prose li { margin: 0.2em 0; line-height: 1.65; }
          .prose li p { margin: 0; }
          .prose strong { font-weight: 600; }
          .prose em { font-style: italic; }
          .prose s  { text-decoration: line-through; }
          .prose code { font-family: monospace; font-size: 0.88em; background: #eff0e7; padding: 1px 5px; border-radius: 3px; }
          .prose pre { background: #eff0e7; border-radius: 8px; padding: 12px 16px; overflow-x: auto; margin: 0.6em 0; }
          .prose pre code { background: none; padding: 0; }
          .prose blockquote { border-left: 3px solid #9ba37a; padding-left: 14px; color: #6b6860; margin: 0.6em 0; }
          div[data-type="toggle"] { margin: 4px 0; }
          div[data-type="toggle"] > * { padding-left: 24px; color: #6b6860; margin-top: 4px; }
        `}</style>
      </head>
      <body>
        {/* Header */}
        <header style={{ borderBottom: "0.5px solid #d6d8cf", background: "#fffefc", padding: "12px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'Newsreader', serif", fontSize: 18, fontWeight: 500, color: "#1f211a", letterSpacing: "-0.02em" }}>
              Perennial
            </span>
            <a href="/login" style={{ fontSize: 12, color: "#9a9690", textDecoration: "none" }}>
              Sign in →
            </a>
          </div>
        </header>

        {/* Note */}
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "56px 40px 120px" }}>
          {note.title && (
            <h1 style={{ fontFamily: "'Newsreader', serif", fontSize: 32, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: "#1f211a", marginBottom: 16 }}>
              {note.title}
            </h1>
          )}

          <p style={{ fontSize: 12, color: "#9a9690", marginBottom: 36 }}>
            Last updated {fmtDate(note.updated_at)}
          </p>

          <div
            className="prose"
            style={{ fontSize: 15, lineHeight: 1.75, color: "#3d3f38" }}
            dangerouslySetInnerHTML={{ __html: note.content ?? "" }}
          />
        </main>

        {/* Footer */}
        <footer style={{ borderTop: "0.5px solid #d6d8cf", padding: "20px 0", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "#9a9690" }}>
            Shared from{" "}
            <a href="/login" style={{ color: "#9ba37a", textDecoration: "none" }}>Perennial</a>
            {" "}— workspace for independent designers
          </p>
        </footer>
      </body>
    </html>
  );
}
