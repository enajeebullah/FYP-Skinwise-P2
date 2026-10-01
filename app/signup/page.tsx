import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="auth-page">
      <div className="auth-card-wrap">
        <a href="/" className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">✦</span>
          SkinWISE
        </a>
        <p className="auth-eyebrow">A MORE PERSONAL SKINCARE JOURNEY</p>
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-description">Start with a few details. Your skin insights are just around the corner.</p>
        <Suspense fallback={null}>
          <AuthForm mode="signup" />
        </Suspense>
        <p className="auth-disclaimer">AI-assisted skin insights, always in your control.</p>
      </div>
    </main>
  );
}
