import Link from "next/link";
import type { ReactNode } from "react";
import UserMenu from "@/components/UserMenu";

type AppSection = "home" | "history" | "profile" | "recommendations" | "routine" | "consultations";

interface NavigationItem {
  label: string;
  href: string;
  section?: AppSection;
  icon: ReactNode;
}

interface AppShellProps {
  activeSection: AppSection;
  email: string;
  fullName: string | null;
  pageTitle: string;
  children: ReactNode;
  footer?: ReactNode;
  showUserMenu?: boolean;
}

const navigation: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/",
    section: "home",
    icon: (
      <path
        d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: "Scan & Analyze",
    href: "/#scanner",
    icon: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      </>
    ),
  },
  {
    label: "Weather",
    href: "/#weather",
    icon: (
      <path
        d="M7 16.5A4.5 4.5 0 1 1 7 7.5a5.5 5.5 0 0 1 9.15 6.2A3.5 3.5 0 1 1 16.5 15.5H7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: "Recommendations",
    href: "/recommendations",
    section: "recommendations",
    icon: (
      <path
        d="M8 7h8m-8 5h8m-8 5h5M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: "Routine",
    href: "/routine",
    section: "routine",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    label: "Scan History",
    href: "/history",
    section: "history",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    label: "Skin Profile",
    href: "/safety-profile",
    section: "profile",
    icon: (
      <>
        <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4 20c1-4 5-6 8-6s7 2 8 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    label: "Consult Dermatologist",
    href: "/consultations",
    section: "consultations",
    icon: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-3 2v-5.5a7.5 7.5 0 1 1 16-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 11h6M12 8v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
];

interface BrandMarkProps {
  className?: string;
}

function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 3C10 10 5 14 5 20a11 11 0 0 0 22 0c0-6-5-10-11-17Z" fill="currentColor" opacity=".16" />
        <path d="M16 5C11 11 7 15 7 20a9 9 0 0 0 18 0c0-5-4-9-9-15Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 21c.5 2 2 3 4 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function AppShell({
  activeSection,
  email,
  fullName,
  pageTitle,
  children,
  footer,
  showUserMenu = true,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="brand-lockup" aria-label="SkinWISE home">
          <BrandMark className="brand-mark" />
          <span>
            <strong>SkinWISE</strong>
            <small>Smart skin analysis using AI,<br />computer vision &amp; weather data</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`sidebar-link${item.section === activeSection ? " active" : ""}`}
              aria-current={item.section === activeSection ? "page" : undefined}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {item.icon}
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="sidebar-note-leaf" aria-hidden="true">✦</span>
          <p>Healthier skin<br />starts with you.</p>
          <small>SkinWISE © 2026</small>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <span className="topbar-kicker">{pageTitle}</span>
            <span className="topbar-date">Your personal skin health space</span>
          </div>
          {showUserMenu && (
            <div className="topbar-tools">
              <UserMenu email={email} fullName={fullName} />
            </div>
          )}
        </header>

        {children}
        {footer}
      </div>
    </div>
  );
}
