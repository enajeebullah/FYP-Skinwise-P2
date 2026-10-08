"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DoctorLoginForm({ accessDenied }: { accessDenied: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    accessDenied ? "Access Denied. This account is not linked to a doctor profile." : null
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/doctor");
    router.refresh();
  }

  return (
    <div className="auth-form-card">
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-field">
          <label htmlFor="doctor-email">Email</label>
          <input
            id="doctor-email"
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
          <label htmlFor="doctor-password">Password</label>
          <input
            id="doctor-password"
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
        <button type="submit" disabled={loading} className="auth-primary-button focus-ring">
          {loading ? "Please wait…" : "Sign in to doctor dashboard"}
        </button>
      </form>
    </div>
  );
}
