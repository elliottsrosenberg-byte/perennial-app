"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-warm-white)]">
        <div className="w-full max-w-sm text-center">
          <span className="font-display text-2xl font-bold text-[var(--color-charcoal)]">perennial</span>
          <div className="mt-8 bg-[var(--color-off-white)] rounded-2xl border border-[var(--color-border)] p-8">
            <div className="w-10 h-10 bg-[var(--color-sage)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3.5 3.5L13 4.5" stroke="var(--color-sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-[var(--color-charcoal)] mb-2">Check your email</h2>
            <p className="text-xs text-[var(--color-grey)] leading-relaxed">
              We sent a confirmation link to <strong className="text-[var(--color-charcoal)]">{email}</strong>. Click it to activate your account.
            </p>
            <Link href="/login" className="mt-4 inline-block text-xs text-[var(--color-sage)] hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-warm-white)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-display text-2xl font-bold text-[var(--color-charcoal)] tracking-tight">
            perennial
          </span>
          <p className="mt-1 text-xs text-[var(--color-grey)]">Tools for independent designers.</p>
        </div>

        <div className="bg-[var(--color-off-white)] rounded-2xl border border-[var(--color-border)] p-8">
          <h1 className="text-sm font-semibold text-[var(--color-charcoal)] mb-6">Create an account</h1>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-[var(--color-warm-white)] border border-[var(--color-border)] rounded-lg text-[var(--color-charcoal)] placeholder:text-[var(--color-grey)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sage)]/40 focus:border-[var(--color-sage)]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 text-sm bg-[var(--color-warm-white)] border border-[var(--color-border)] rounded-lg text-[var(--color-charcoal)] placeholder:text-[var(--color-grey)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sage)]/40 focus:border-[var(--color-sage)]"
                placeholder="Min 8 characters"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-[var(--color-warm-white)] border border-[var(--color-border)] rounded-lg text-[var(--color-charcoal)] placeholder:text-[var(--color-grey)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sage)]/40 focus:border-[var(--color-sage)]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--color-red-orange)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium bg-[var(--color-charcoal)] text-[var(--color-warm-white)] rounded-lg hover:bg-[var(--color-charcoal)]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-[var(--color-grey)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--color-sage)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
