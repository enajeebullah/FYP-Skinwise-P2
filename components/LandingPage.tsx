import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Understand your skin",
    description:
      "Get an AI-assisted skin type reading and a clearer view of the patterns in your scan.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v4.8l3.2 2" />
      </>
    ),
  },
  {
    number: "02",
    title: "Recommendations that fit",
    description:
      "See a practical routine shaped around your skin type, confirmed counts, and local weather.",
    icon: (
      <>
        <path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v13.5H4.5V6A1.5 1.5 0 0 1 6 4.5Z" />
        <path d="M8 9h8M8 12.5h8M8 16h4" />
      </>
    ),
  },
  {
    number: "03",
    title: "Track your progress",
    description:
      "Keep a private history of your scan summaries and follow changes over time.",
    icon: (
      <>
        <path d="M4 18.5 9 13l3.5 3 7.5-9" />
        <path d="M15.5 7H20v4.5" />
        <path d="M4 4.5v15h16" />
      </>
    ),
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link href="/" className="landing-brand" aria-label="SkinWISE home">
          <span className="landing-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 3C10 10 5 14 5 20a11 11 0 0 0 22 0c0-6-5-10-11-17Z" />
              <path d="M12 21c.5 2 2 3 4 3" />
            </svg>
          </span>
          <span>SkinWISE</span>
        </Link>

        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">What you get</a>
        </nav>

        <div className="landing-header-actions">
          <Link href="/login" className="landing-login">Log in</Link>
          <Link href="/signup" className="landing-button landing-button-small">
            Get started
          </Link>
        </div>
      </header>

      <section className="landing-hero" id="how-it-works">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">
            <span aria-hidden="true" /> YOUR PERSONAL SKIN HEALTH SPACE
          </span>
          <h1>Healthier skin starts with <em>understanding.</em></h1>
          <p className="landing-lede">
            A thoughtful look at your skin, powered by AI. Get a skin type
            reading, review detected acne lesions, and explore a routine shaped
            around your results.
          </p>
          <div className="landing-hero-actions">
            <Link href="/signup" className="landing-button">
              Get started <span aria-hidden="true">→</span>
            </Link>
            <a href="#features" className="landing-text-link">
              Explore SkinWISE
            </a>
          </div>
          <div className="landing-trust-note">
            <span className="landing-shield" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            Your scan photo is not saved to your account.
          </div>
        </div>

        <div className="landing-hero-art" aria-label="Illustration of a skin analysis">
          <div className="landing-art-orbit landing-art-orbit-one" />
          <div className="landing-art-orbit landing-art-orbit-two" />
          <div className="landing-art-glow" />
          <div className="landing-face-card">
            <div className="landing-face-topline">
              <span><i /> SKINWISE ANALYSIS</span>
              <span>01 / 03</span>
            </div>
            <svg className="landing-face-illustration" viewBox="0 0 250 310" fill="none" aria-hidden="true">
              <path d="M125 31c-51 0-81 39-81 99v34c0 56 33 99 81 99s81-43 81-99v-34c0-60-30-99-81-99Z" fill="url(#faceFill)" />
              <path d="M44 129c-8-57 25-98 80-98s88 41 80 98c-13-18-27-32-43-39-24 22-62 33-117 39Z" fill="#283B79" />
              <path d="M87 151c8-7 18-7 26 0m24 0c8-7 18-7 26 0" stroke="#46528C" strokeWidth="4" strokeLinecap="round" />
              <path d="M125 155v43l-13 9" stroke="#C57E77" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M104 225c13 9 29 9 42 0" stroke="#B96F75" strokeWidth="4" strokeLinecap="round" />
              <path d="M73 136c-16-8-29 3-25 24 3 17 12 23 23 21m106-45c16-8 29 3 25 24-3 17-12 23-23 21" fill="#E7AE9E" />
              <path d="M44 131c-8-57 25-98 80-98s88 41 80 98" stroke="#7788E8" strokeWidth="2" strokeDasharray="5 7" />
              <circle cx="82" cy="188" r="4" fill="#A2AEFF" />
              <circle cx="165" cy="178" r="4" fill="#A2AEFF" />
              <circle cx="105" cy="212" r="3" fill="#A2AEFF" />
              <defs>
                <linearGradient id="faceFill" x1="51" y1="74" x2="199" y2="249" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#F5D9CB" />
                  <stop offset="1" stopColor="#DDA99C" />
                </linearGradient>
              </defs>
            </svg>
            <div className="landing-art-caption">
              <span className="landing-art-icon" aria-hidden="true">✦</span>
              <span><strong>Insight, made personal</strong><small>Understand your skin, one scan at a time.</small></span>
            </div>
          </div>
          <div className="landing-floating-card">
            <span className="landing-floating-dot" />
            <span><small>YOUR SKIN TYPE</small><strong>Made for you</strong></span>
          </div>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-heading">
          <div>
            <p className="landing-section-kicker">A clearer picture</p>
            <h2>Care that starts with insight.</h2>
          </div>
          <p>Thoughtful tools to help you understand your skin and build a routine that feels right for you.</p>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article className="landing-feature-card" key={feature.number}>
              <div className="landing-feature-top">
                <span className="landing-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {feature.icon}
                  </svg>
                </span>
                <span>{feature.number}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>SkinWISE</span>
        <span>AI-assisted skin insights. Not a substitute for professional medical advice.</span>
        <Link href="/signup">Start your first scan <span aria-hidden="true">→</span></Link>
      </footer>
    </main>
  );
}
