import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-card-wrap">
        <a href="/" className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">✦</span>
          SkinWISE
        </a>
        <p className="auth-eyebrow">YOUR PERSONAL SKIN HEALTH SPACE</p>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-description">Sign in to continue your skin journey.</p>
        <Suspense fallback={null}>
          <AuthForm mode="login" />
        </Suspense>
        <p className="auth-disclaimer">AI-assisted skin insights, always in your control.</p>
      </div>
    </main>
  );
}
