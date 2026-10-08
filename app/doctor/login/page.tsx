import DoctorLoginForm from "@/components/DoctorLoginForm";

interface DoctorLoginPageProps {
  searchParams: {
    error?: string;
  };
}

export default function DoctorLoginPage({ searchParams }: DoctorLoginPageProps) {
  return (
    <main className="auth-page">
      <div className="auth-card-wrap">
        <a href="/" className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">✦</span>
          SkinWISE <span className="ml-1 text-xs font-medium tracking-normal text-slate-500">DOCTOR</span>
        </a>
        <p className="auth-eyebrow">SECURE DOCTOR ACCESS</p>
        <h1 className="auth-title">Doctor sign in</h1>
        <p className="auth-description">Sign in with the account linked to your doctor profile.</p>
        <DoctorLoginForm accessDenied={searchParams.error === "access_denied"} />
        <p className="auth-disclaimer">Doctor access is restricted to linked accounts.</p>
      </div>
    </main>
  );
}
