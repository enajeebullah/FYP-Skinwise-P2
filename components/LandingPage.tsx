import Link from "next/link";

const features = [
  { number: "01", title: "AI skin type analysis", description: "Explore an AI-assisted reading of visible skin characteristics and confirm your skin type.", icon: <><path d="M4 8V5h3m10 0h3v3m0 8v3h-3m-10 0H4v-3"/><circle cx="12" cy="11" r="3"/><path d="M7 18c.8-2.2 2.4-3.3 5-3.3s4.2 1.1 5 3.3"/></> },
  { number: "02", title: "Acne pattern review", description: "Review detected acne lesions and confirmed counts as part of your scan results.", icon: <><circle cx="6" cy="6" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="18" cy="6" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/><circle cx="6" cy="18" r="1"/><circle cx="12" cy="18" r="1"/><circle cx="18" cy="18" r="1"/></> },
  { number: "03", title: "Personalized skincare routine", description: "Explore practical routine guidance shaped around your skin type and results.", icon: <><path d="M7 4h10l-1 16H8L7 4Z"/><path d="M9 7h6"/></> },
  { number: "04", title: "Weather-aware recommendations", description: "See local weather context alongside guidance for your skincare routine.", icon: <><circle cx="8" cy="8" r="3"/><path d="M8 2v2m0 8v2m6-6h-2m-8 0H2m10.2-4.2-1.4 1.4M5.2 10.8l-1.4 1.4m11.7 4.3H8.2a3.2 3.2 0 1 1 .5-6.4A4.5 4.5 0 0 1 17 12a2.3 2.3 0 0 1-.5 4.5Z"/></> },
  { number: "05", title: "Safety profile guidance", description: "Record relevant safety information to help tailor skincare guidance to your needs.", icon: <><path d="m12 3 7 3v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></> },
  { number: "06", title: "Progress and scan history", description: "Keep scan summaries in your account and follow changes over time.", icon: <><path d="M4 19V5m0 14h16"/><path d="m7 15 4-4 3 2 5-6"/><path d="M15 7h4v4"/></> },
];

const steps = [
  { number: "01", title: "Upload a photo", description: "Add a clear frontal photo or use your camera to begin a scan.", icon: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></> },
  { number: "02", title: "Review your analysis", description: "Explore your AI-assisted skin type and acne analysis, then confirm your results.", icon: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></> },
  { number: "03", title: "Explore your routine", description: "Use your results to explore routine guidance and track scan summaries over time.", icon: <><path d="M12 3v18m9-9H3"/><circle cx="12" cy="12" r="8.5"/></> },
];

function BrandMark() {
  return <span className="landing-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3C10 10 5 14 5 20a11 11 0 0 0 22 0c0-6-5-10-11-17Z"/><path d="M12 21c.5 2 2 3 4 3"/></svg></span>;
}

function Arrow() { return <span aria-hidden="true">→</span>; }

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link href="/" className="landing-brand" aria-label="SkinWISE home"><BrandMark /><span>SkinWISE</span></Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#about">About</a>
        </nav>
        <details className="landing-mobile-nav">
          <summary aria-label="Open navigation menu"><span/><span/><span/></summary>
          <nav aria-label="Mobile navigation"><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#about">About</a><Link href="/login">Login</Link><Link href="/signup">Get Started</Link></nav>
        </details>
        <div className="landing-header-actions"><Link href="/login" className="landing-login">Login</Link><Link href="/signup" className="landing-button landing-button-small">Get Started <Arrow /></Link></div>
      </header>

      <section className="landing-hero" id="about">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow"><span aria-hidden="true">✦</span> AI-POWERED SKIN ANALYSIS</span>
          <h1>Understand Your Skin.<br/>Discover a <em>Smarter Routine.</em></h1>
          <p className="landing-lede">SkinWISE uses AI to help you understand your skin type, review acne patterns and explore personalized skincare guidance shaped around your results.</p>
          <div className="landing-hero-actions"><Link href="/signup" className="landing-button">Get Started <Arrow /></Link><a href="#how-it-works" className="landing-button landing-button-outline"><span aria-hidden="true">▷</span> How it works</a></div>
          <p className="landing-trust-note"><span className="landing-trust-icon" aria-hidden="true">✓</span>Your scan photo is not saved to your account.</p>
        </div>

        <div className="landing-showcase" aria-label="Illustrative preview of SkinWISE analysis results">
          <div className="landing-showcase-backdrop" />
          <div className="landing-portrait-frame"><img src="/images/scan-hero-portrait1.png" alt="Illustrative AI skin analysis interface featuring a portrait and sample result panels"/><span className="landing-scan-line"/><span className="landing-portrait-caption">ILLUSTRATIVE PREVIEW · NOT A PATIENT RESULT</span></div>
          <article className="landing-result-card landing-result-skin"><span className="landing-result-icon">◉</span><span><small>SKIN TYPE INSIGHT</small><strong>Personal to you</strong></span></article>
          <article className="landing-result-card landing-result-acne"><span className="landing-result-icon">✦</span><span><small>ACNE PATTERN</small><strong>Review detected areas</strong></span></article>
          <article className="landing-result-card landing-result-severity"><span className="landing-result-icon">◌</span><span><small>SCAN SUMMARY</small><strong>Explore your results</strong></span></article>
          <article className="landing-routine-card"><span className="landing-routine-kicker">YOUR SKINWISE ROUTINE</span><strong>Small steps, made clearer</strong><span className="landing-routine-row"><i/>Cleanse</span><span className="landing-routine-row"><i/>Moisturize</span><span className="landing-routine-row"><i/>Sun protection</span></article>
          <span className="landing-showcase-spark landing-spark-one" aria-hidden="true">✦</span><span className="landing-showcase-spark landing-spark-two" aria-hidden="true">✧</span>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-title"><span className="landing-section-rule"/><h2>Powerful Features for <em>Healthier Skin</em></h2><span className="landing-section-rule"/></div>
        <div className="landing-feature-grid">{features.map((feature) => <article className="landing-feature-card" key={feature.number}><span className="landing-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{feature.icon}</svg></span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
      </section>

      <section className="landing-how" id="how-it-works">
        <div className="landing-how-intro"><span className="landing-section-kicker">A simple place to start</span><h2>How SkinWISE Works</h2><p>Three steps to a clearer picture of your skin.</p><Link href="/signup" className="landing-button landing-button-small">Get Started <Arrow /></Link></div>
        <div className="landing-steps">{steps.map((step, index) => <article className="landing-step" key={step.number}><span className="landing-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{step.icon}</svg></span><span className="landing-step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.description}</p></div>{index < steps.length - 1 && <span className="landing-step-arrow" aria-hidden="true">›</span>}</article>)}</div>
      </section>

      <section className="landing-cta" aria-labelledby="landing-cta-title"><div className="landing-cta-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="m24 4 16 7v11c0 10-6.4 17.2-16 22-9.6-4.8-16-12-16-22V11l16-7Z"/><path d="M24 33s-9-5.2-9-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.8-9 11-9 11Z"/></svg></div><div className="landing-cta-heading"><h2 id="landing-cta-title">Your Skin. Our Care.</h2><p>Personal. AI-assisted.</p></div><p className="landing-cta-copy">Start your SkinWISE journey today and take the first step towards understanding your skin.</p><div className="landing-cta-actions"><Link href="/signup" className="landing-button landing-button-light">Get Started <Arrow /></Link><span>or <Link href="/login">Login</Link></span></div></section>

      <footer className="landing-footer"><Link href="/" className="landing-brand" aria-label="SkinWISE home"><BrandMark/><span>SkinWISE</span></Link><nav className="landing-footer-nav" aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#about">About</a></nav><div className="landing-footer-auth"><Link href="/login">Login</Link><span aria-hidden="true">|</span><Link href="/signup">Sign Up</Link></div><p>AI-assisted skin insights. Not a substitute for professional medical advice.</p></footer>
    </main>
  );
}
