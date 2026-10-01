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
      <div className="auth-form-card auth-success">
        <span className="auth-success-icon" aria-hidden="true">✓</span>
        <p className="auth-success-title">Check your inbox</p>
        <p className="auth-success-copy">
          We&rsquo;ve sent a confirmation link to <strong>{email}</strong>. Verify
          your email, then log in.
        </p>
        <a
          href="/login"
          className="auth-primary-button focus-ring inline-flex mt-5"
        >
          Go to login
        </a>
      </div>
    );
  }

  return (
    <div className="auth-form-card">
      <form onSubmit={handleSubmit} className="auth-form">
        {mode === "signup" && (
          <div className="auth-field">
            <label htmlFor="full-name">
              Full name
            </label>
            <input
              id="full-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="focus-ring"
              placeholder="Your name"
            />
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="focus-ring"
            placeholder="you@example.com"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring"
            placeholder={mode === "login" ? "Enter your password" : "At least 6 characters"}
          />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="auth-primary-button focus-ring"
        >
          {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <div className="auth-divider">
        <span>or continue with</span>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="auth-google-button focus-ring"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3a7.23 7.23 0 0 1-10.73-3.8H1.32v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.32 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.32a12 12 0 0 0 0 10.78l4-3.1z" />
          <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.32 6.61l4 3.1A7.2 7.2 0 0 1 12 4.75z" />
        </svg>
        Continue with Google
      </button>

      <p className="auth-switch">
        {mode === "login" ? (
          <>Don&rsquo;t have an account? <a href="/signup" className="underline underline-offset-4 text-ink">Sign up</a></>
        ) : (
          <>Already have an account? <a href="/login" className="underline underline-offset-4 text-ink">Log in</a></>
        )}
      </p>
    </div>
  );
}
