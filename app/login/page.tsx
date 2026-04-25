"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-warm-white)]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="font-display text-2xl font-bold text-[var(--color-charcoal)] tracking-tight">
            perennial
          </span>
          <p className="mt-1 text-xs text-[var(--color-grey)]">Tools for independent designers.</p>
        </div>

        <div className="bg-[var(--color-off-white)] rounded-2xl border border-[var(--color-border)] p-8">
          <h1 className="text-sm font-semibold text-[var(--color-charcoal)] mb-6">Sign in</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5">
                Email
              </label>
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
              <label className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-[var(--color-grey)]">
          No account yet?{" "}
          <Link href="/signup" className="text-[var(--color-sage)] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
