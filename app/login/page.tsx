"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between overflow-hidden"
        style={{ background: "#1f211a" }}>

        {/* Botanical */}
        <img src="/botanicals/Botanical Illustrations.png" aria-hidden="true" alt=""
          style={{ position: "absolute", bottom: "-10%", right: "-18%", width: 820, height: "auto",
            opacity: 0.55, pointerEvents: "none", userSelect: "none" }} />

        {/* Top — Logotype */}
        <div className="relative z-10 p-10">
          <Image src="/Logotype.svg" alt="Perennial" width={160} height={38} style={{ height: "auto", opacity: 0.9 }} />
        </div>

        {/* Center — Tagline */}
        <div className="relative z-10 px-10 pb-4">
          <p style={{ fontFamily: "var(--font-newsreader)", fontSize: 44, fontWeight: 400, lineHeight: 1.15,
            letterSpacing: "-0.01em" }}>
            <span style={{ color: "#f5f1e9" }}>infrastructure</span>
            <br />
            <span style={{ color: "#f5f1e9" }}>for designers</span>
            <br />
            <span style={{ color: "#f5f1e9" }}>and makers.</span>
          </p>
        </div>

        {/* Bottom — Fine print */}
        <div className="relative z-10 p-10">
          <p style={{ fontSize: 11, color: "rgba(245,241,233,0.35)", letterSpacing: "0.04em" }}>
            © {new Date().getFullYear()} Perennial · Beta
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-6 py-12"
        style={{ background: "var(--color-warm-white)" }}>

        {/* Botanical — right panel */}
        <img src="/botanicals/Botanical Illustrations-4.png" aria-hidden="true" alt=""
          style={{ position: "absolute", bottom: "-12%", right: "-18%", width: 560, height: "auto",
            opacity: 0.055, mixBlendMode: "multiply", pointerEvents: "none", userSelect: "none" }} />

        <div className="relative z-10 w-full" style={{ maxWidth: 420 }}>

          {/* Logo — shown on mobile only */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <Image src="/logomark.svg" alt="Perennial" width={52} height={54} style={{ height: "auto", marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: "var(--color-grey)", letterSpacing: "0.01em" }}>
              infrastructure for designers and makers.
            </p>
          </div>

          {/* Card */}
          <div style={{
            background: "var(--color-off-white)",
            borderRadius: 20,
            border: "0.5px solid var(--color-border)",
            boxShadow: "0 8px 40px rgba(31,33,26,0.10), 0 1px 4px rgba(31,33,26,0.06)",
            padding: "40px 44px",
          }}>
            <h1 style={{ fontFamily: "var(--font-newsreader)", fontSize: 26, fontWeight: 700,
              color: "var(--color-charcoal)", marginBottom: 6, letterSpacing: "-0.01em" }}>
              Sign in
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-grey)", marginBottom: 32 }}>
              Welcome back.
            </p>

            <button
              type="button"
              onClick={handleGoogle}
              style={{
                width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 500,
                background: "var(--color-warm-white)", color: "var(--color-charcoal)",
                border: "0.5px solid var(--color-border)", borderRadius: 10,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-cream)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-warm-white)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.63z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
              <span style={{ fontSize: 11, color: "var(--color-grey)", letterSpacing: "0.04em", textTransform: "uppercase" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
            </div>

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500,
                  color: "var(--color-charcoal)", marginBottom: 7 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "11px 14px", fontSize: 14,
                    background: "var(--color-warm-white)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 10, color: "var(--color-charcoal)",
                    outline: "none", fontFamily: "inherit",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px rgba(155,163,122,0.18)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)" }}>
                    Password
                  </label>
                  <Link href="/forgot-password" style={{ fontSize: 12, color: "var(--color-sage)", textDecoration: "none" }}>
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "11px 14px", fontSize: 14,
                    background: "var(--color-warm-white)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 10, color: "var(--color-charcoal)",
                    outline: "none", fontFamily: "inherit",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px rgba(155,163,122,0.18)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
                />
              </div>

              {error && (
                <p style={{ fontSize: 12, color: "var(--color-red-orange)", marginTop: -8 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%", padding: "13px 0", fontSize: 14, fontWeight: 600,
                  background: "var(--color-sage)", color: "var(--color-warm-white)",
                  border: "none", borderRadius: 10, cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.6 : 1, fontFamily: "inherit",
                  transition: "opacity 0.15s ease",
                  marginTop: 4,
                }}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--color-grey)" }}>
            No account yet?{" "}
            <Link href="/signup" style={{ color: "var(--color-sage)", textDecoration: "none", fontWeight: 500 }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
