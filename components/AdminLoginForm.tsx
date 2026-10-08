"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AdminLoginFormProps {
  accessDenied: boolean;
}

export default function AdminLoginForm({ accessDenied }: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    accessDenied ? "Access Denied. This account is not authorized to access the admin panel." : null
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="auth-form-card">
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-field">
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="focus-ring"
            placeholder="you@example.com"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="focus-ring"
            placeholder="Enter your password"
          />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="auth-primary-button focus-ring"
        >
          {loading ? "Please wait…" : "Sign in to admin"}
        </button>
      </form>
    </div>
  );
}
