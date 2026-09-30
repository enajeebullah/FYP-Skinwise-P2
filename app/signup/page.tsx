import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-dry via-normal to-oily" />
          <span className="font-display text-lg tracking-tight">SkinWISE</span>
        </div>
        <h1 className="font-display text-2xl text-center mb-6">Create your account</h1>
        <Suspense fallback={null}>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </main>
  );
}
