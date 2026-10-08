import AdminLoginForm from "@/components/AdminLoginForm";

interface AdminLoginPageProps {
  searchParams: {
    error?: string;
  };
}

export default function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  return (
    <main className="auth-page">
      <div className="auth-card-wrap">
        <a href="/" className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">✦</span>
          SkinWISE <span className="ml-1 text-xs font-medium tracking-normal text-slate-500">ADMIN</span>
        </a>
        <p className="auth-eyebrow">SECURE ADMINISTRATOR ACCESS</p>
        <h1 className="auth-title">Admin sign in</h1>
        <p className="auth-description">Sign in with your authorized SkinWISE account.</p>
        <AdminLoginForm accessDenied={searchParams.error === "access_denied"} />
        <p className="auth-disclaimer">Administrator access is restricted to approved accounts.</p>
      </div>
    </main>
  );
}
