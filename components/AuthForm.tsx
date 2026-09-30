"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setLoading(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setSignupDone(true);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (oauthError) setError(oauthError.message);
  }

  if (signupDone) {
    return (
      <div className="rounded-2xl border border-line bg-panel panel-elevated p-8 text-center">
        <p className="font-display text-xl">Check your inbox</p>
        <p className="text-sm text-ink/70 mt-2">
          We&rsquo;ve sent a confirmation link to <strong>{email}</strong>. Verify
          your email, then log in.
        </p>
        <a
          href="/login"
          className="focus-ring inline-block mt-5 text-sm font-medium underline underline-offset-4"
        >
          Go to login
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel panel-elevated p-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-muted">
              Full name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="focus-ring mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="focus-ring mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-muted">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="focus-ring w-full rounded-full bg-ink text-paper py-2.5 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="h-px bg-line flex-1" />
        <span className="text-xs text-muted">or</span>
        <div className="h-px bg-line flex-1" />
      </div>

      <button
        onClick={handleGoogle}
        className="focus-ring w-full rounded-full border border-line py-2.5 text-sm font-medium hover:bg-paper transition-colors flex items-center justify-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3a7.23 7.23 0 0 1-10.73-3.8H1.32v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.32 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.32a12 12 0 0 0 0 10.78l4-3.1z" />
          <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.32 6.61l4 3.1A7.2 7.2 0 0 1 12 4.75z" />
        </svg>
        Continue with Google
      </button>

      <p className="text-center text-sm text-muted mt-6">
        {mode === "login" ? (
          <>Don&rsquo;t have an account? <a href="/signup" className="underline underline-offset-4 text-ink">Sign up</a></>
        ) : (
          <>Already have an account? <a href="/login" className="underline underline-offset-4 text-ink">Log in</a></>
        )}
      </p>
    </div>
  );
}
