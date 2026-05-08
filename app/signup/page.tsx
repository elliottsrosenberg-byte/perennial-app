"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "11px 14px", fontSize: 14,
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  borderRadius: 10, color: "var(--color-charcoal)",
  outline: "none", fontFamily: "inherit",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500,
        color: "var(--color-charcoal)", marginBottom: 7 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
    }
  }

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "var(--color-sage)";
    e.target.style.boxShadow = "0 0 0 3px rgba(155,163,122,0.18)";
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "var(--color-border)";
    e.target.style.boxShadow = "none";
  }

  const leftPanel = (
    <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between overflow-hidden"
      style={{ background: "#1f211a" }}>
      <img src="/botanicals/Botanical Illustrations.png" aria-hidden="true" alt=""
        style={{ position: "absolute", bottom: "-10%", right: "-18%", width: 820, height: "auto",
          opacity: 0.55, pointerEvents: "none", userSelect: "none" }} />

      <div className="relative z-10 p-10">
        <Image src="/Logotype.svg" alt="Perennial" width={160} height={38} style={{ height: "auto", opacity: 0.9 }} />
      </div>

      <div className="relative z-10 px-10 pb-4">
        <p style={{ fontFamily: "var(--font-newsreader)", fontSize: 44, fontWeight: 400, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
          <span style={{ color: "#f5f1e9" }}>infrastructure</span>
          <br />
          <span style={{ color: "#f5f1e9" }}>for designers</span>
          <br />
          <span style={{ color: "#f5f1e9" }}>and makers.</span>
        </p>
      </div>

      <div className="relative z-10 p-10">
        <p style={{ fontSize: 11, color: "rgba(245,241,233,0.35)", letterSpacing: "0.04em" }}>
          © {new Date().getFullYear()} Perennial · Beta
        </p>
      </div>
    </div>
  );

  if (success) {
    return (
      <div className="min-h-screen flex">
        {leftPanel}
        <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-6 py-12"
          style={{ background: "var(--color-warm-white)" }}>
          <img src="/botanicals/Botanical Illustrations-4.png" aria-hidden="true" alt=""
            style={{ position: "absolute", bottom: "-12%", right: "-18%", width: 560, height: "auto",
              opacity: 0.055, mixBlendMode: "multiply", pointerEvents: "none", userSelect: "none" }} />

          <div className="relative z-10 w-full" style={{ maxWidth: 420 }}>
            <div className="lg:hidden flex flex-col items-center mb-10">
              <Image src="/logomark.svg" alt="Perennial" width={52} height={54} style={{ height: "auto", marginBottom: 12 }} />
            </div>

            <div style={{
              background: "var(--color-off-white)", borderRadius: 20,
              border: "0.5px solid var(--color-border)",
              boxShadow: "0 8px 40px rgba(31,33,26,0.10), 0 1px 4px rgba(31,33,26,0.06)",
              padding: "48px 44px", textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(155,163,122,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px",
              }}>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 4.5" stroke="var(--color-sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: "var(--font-newsreader)", fontSize: 26, fontWeight: 700,
                color: "var(--color-charcoal)", marginBottom: 10, letterSpacing: "-0.01em" }}>
                Check your email
              </h2>
              <p style={{ fontSize: 13, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 24 }}>
                We sent a confirmation link to{" "}
                <strong style={{ color: "var(--color-charcoal)", fontWeight: 500 }}>{email}</strong>.
                Click it to activate your account.
              </p>
              <Link href="/login" style={{ fontSize: 13, color: "var(--color-sage)", textDecoration: "none", fontWeight: 500 }}>
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {leftPanel}

      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-6 py-12"
        style={{ background: "var(--color-warm-white)" }}>
        <img src="/botanicals/Botanical Illustrations-4.png" aria-hidden="true" alt=""
          style={{ position: "absolute", bottom: "-12%", right: "-18%", width: 560, height: "auto",
            opacity: 0.055, mixBlendMode: "multiply", pointerEvents: "none", userSelect: "none" }} />

        <div className="relative z-10 w-full" style={{ maxWidth: 420 }}>
          <div className="lg:hidden flex flex-col items-center mb-10">
            <Image src="/logomark.svg" alt="Perennial" width={52} height={54} style={{ height: "auto", marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: "var(--color-grey)", letterSpacing: "0.01em" }}>
              infrastructure for designers and makers.
            </p>
          </div>

          <div style={{
            background: "var(--color-off-white)", borderRadius: 20,
            border: "0.5px solid var(--color-border)",
            boxShadow: "0 8px 40px rgba(31,33,26,0.10), 0 1px 4px rgba(31,33,26,0.06)",
            padding: "40px 44px",
          }}>
            <h1 style={{ fontFamily: "var(--font-newsreader)", fontSize: 26, fontWeight: 700,
              color: "var(--color-charcoal)", marginBottom: 6, letterSpacing: "-0.01em" }}>
              Create an account
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-grey)", marginBottom: 32 }}>
              Join the beta.
            </p>

            <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required placeholder="you@example.com"
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
              </Field>

              <Field label="Password">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={8} placeholder="Min 8 characters"
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
              </Field>

              <Field label="Confirm password">
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  required placeholder="••••••••"
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
              </Field>

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
                  transition: "opacity 0.15s ease", marginTop: 4,
                }}
              >
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>
          </div>

          <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--color-grey)" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--color-sage)", textDecoration: "none", fontWeight: 500 }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
