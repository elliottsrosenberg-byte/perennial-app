"use client";

import { useState, useEffect } from "react";
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

function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      style={{
        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
        background: "none", border: "none", padding: 6, cursor: "pointer",
        color: "var(--color-grey)", display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6,
      }}
    >
      {visible ? (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.03 10.03 0 003.3-4.38 1.65 1.65 0 000-1.185A10.004 10.004 0 0010 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd"/>
          <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.65 1.65 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
          <path fillRule="evenodd" d="M.664 10.59a1.65 1.65 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
        </svg>
      )}
    </button>
  );
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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");

    // If we got here via the new token_hash email flow, exchange it for a session.
    // If not (e.g. legacy /auth/callback path), assume a session already exists.
    if (tokenHash && type === "recovery") {
      const supabase = createClient();
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error }) => {
          if (error) {
            setVerifyError("This reset link is invalid or has expired. Please request a new one.");
          }
          setVerifying(false);
        });
    } else {
      setVerifying(false);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/?reset=true");
    }
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
          </div>

          <div style={{
            background: "var(--color-off-white)", borderRadius: 20,
            border: "0.5px solid var(--color-border)",
            boxShadow: "0 8px 40px rgba(31,33,26,0.10), 0 1px 4px rgba(31,33,26,0.06)",
            padding: "40px 44px",
          }}>
            {verifying ? (
              <p style={{ fontSize: 13, color: "var(--color-grey)", textAlign: "center", padding: "20px 0" }}>
                Verifying reset link…
              </p>
            ) : verifyError ? (
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontFamily: "var(--font-newsreader)", fontSize: 22, fontWeight: 700,
                  color: "var(--color-charcoal)", marginBottom: 10, letterSpacing: "-0.01em" }}>
                  Link expired
                </h2>
                <p style={{ fontSize: 13, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 24 }}>
                  {verifyError}
                </p>
                <Link href="/forgot-password" style={{ fontSize: 13, color: "var(--color-sage)", textDecoration: "none", fontWeight: 500 }}>
                  Request a new link
                </Link>
              </div>
            ) : (
            <>
            <h1 style={{ fontFamily: "var(--font-newsreader)", fontSize: 26, fontWeight: 700,
              color: "var(--color-charcoal)", marginBottom: 6, letterSpacing: "-0.01em" }}>
              New password
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-grey)", marginBottom: 32 }}>
              Choose something strong.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500,
                  color: "var(--color-charcoal)", marginBottom: 7 }}>
                  New password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Min 8 characters"
                    style={{ ...inputStyle, padding: "11px 42px 11px 14px" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px rgba(155,163,122,0.18)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
                  />
                  <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((s) => !s)} />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500,
                  color: "var(--color-charcoal)", marginBottom: 7 }}>
                  Confirm password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="••••••••"
                    style={{ ...inputStyle, padding: "11px 42px 11px 14px" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px rgba(155,163,122,0.18)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
                  />
                  <PasswordToggle visible={showConfirm} onToggle={() => setShowConfirm((s) => !s)} />
                </div>
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
                  transition: "opacity 0.15s ease", marginTop: 4,
                }}
              >
                {loading ? "Updating…" : "Set new password"}
              </button>
            </form>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
