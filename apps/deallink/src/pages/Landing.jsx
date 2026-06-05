import React from 'react';
import { Link } from 'react-router-dom';
import './landing.css';

function Arrow() {
  return (
    <svg className="btn__arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      <circle cx="17" cy="9" r="2.75" />
      <path d="M21.5 19a4.5 4.5 0 0 0-6.2-4.16" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21h18" />
      <rect x="5" y="12" width="3" height="7" />
      <rect x="10.5" y="7" width="3" height="12" />
      <rect x="16" y="3" width="3" height="16" />
    </svg>
  );
}

const FEATURES = [
  { num: '01', Icon: GlobeIcon, title: 'A public profile', body: 'Avatar, handle, bio. Buyers bookmark it. You only post once.' },
  { num: '02', Icon: UploadIcon, title: 'Bulk import deals', body: 'Drop a CSV. We auto-map columns and flag duplicates.' },
  { num: '03', Icon: UsersIcon, title: 'Capture lead intent', body: "Buyers tap 'I'm interested.' Name, email, phone — straight to your inbox." },
  { num: '04', Icon: BarChartIcon, title: 'Pipeline & analytics', body: "See offers, track stages, measure what's actually moving." },
];

const STEPS = [
  { num: 'Step 01', title: 'Claim your handle', body: <>Pick a slug like <span className="mono">doorine.com/r/yourname</span>. Your profile is live in under a minute.</> },
  { num: 'Step 02', title: 'Post inventory', body: 'Add deals one-by-one or import a CSV. Every property gets its own clean public page.' },
  { num: 'Step 03', title: 'Send the link', body: 'SMS, email, signature, social. Buyers self-serve. Hot leads land in your pipeline.' },
];

export default function Landing() {
  return (
    <div className="lp">
      {/* NAV */}
      <header className="nav">
        <div className="nav__inner">
          <Link to="/" className="wordmark">REI<span className="wordmark__accent">flywheel</span></Link>
          <nav className="nav__links">
            <a href="#features" className="nav__link">Features</a>
            <a href="#how" className="nav__link">How it works</a>
            <a href="#" className="nav__link">Pricing</a>
            <Link to="/login" className="nav__link">Sign in</Link>
            <Link to="/signup" className="btn btn--primary">Claim your handle <Arrow /></Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="container">
          <span className="hero__eyebrow">For real estate wholesalers</span>
          <h1 className="hero__title">One link for every<br />deal you <span className="serif">wholesale</span>.</h1>
          <p className="hero__sub">Share a public profile. Post inventory once. Capture buyers — without the spreadsheet shuffle.</p>
          <div className="hero__ctas">
            <Link to="/signup" className="btn btn--primary btn--lg">Claim your handle <Arrow /></Link>
            <Link to="/demo" className="btn btn--ghost btn--lg">View example profile</Link>
          </div>
          <div className="hero__url">doorine.com/r/<span className="slug">yourname</span></div>
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="preview">
        <div className="container">
          <div className="preview__frame">
            <div className="preview__chrome">
              <div className="preview__dots">
                <span className="preview__dot" />
                <span className="preview__dot" />
                <span className="preview__dot" />
              </div>
              <div className="preview__url-bar">doorine.com/r/testing25.deals</div>
            </div>
            <div className="preview__placeholder">Dashboard preview — screenshot coming soon</div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="container">
          <div className="features__header">
            <span className="features__eyebrow">What you get</span>
            <h2 className="features__title">Everything a wholesaler needs to <span className="serif">close</span>, in one place.</h2>
          </div>
          <div className="features__grid">
            {FEATURES.map((f) => (
              <article className="feature" key={f.num}>
                <div className="feature__num">{f.num}</div>
                <div className="feature__icon"><f.Icon /></div>
                <h3 className="feature__title">{f.title}</h3>
                <p className="feature__body">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="steps" id="how">
        <div className="container">
          <div className="steps__header">
            <h2 className="steps__title">Set up <span className="serif">once</span>. Run every deal through it.</h2>
            <p className="steps__lede">Built for solo wholesalers and small teams. No setup calls, no migrations — just a link that does the work.</p>
          </div>
          <div className="steps__grid">
            {STEPS.map((s) => (
              <article className="step" key={s.num}>
                <div className="step__num">{s.num}</div>
                <h3 className="step__title">{s.title}</h3>
                <p className="step__body">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="cta">
        <div className="container">
          <div className="cta__inner">
            <span className="cta__eyebrow">Get your link</span>
            <h2 className="cta__title">Start sending <span className="serif">today</span>.</h2>
            <p className="cta__sub">Free while you build your list. No credit card. Upgrade when you're closing.</p>
            <div className="hero__ctas">
              <Link to="/signup" className="btn btn--primary btn--lg">Claim your handle <Arrow /></Link>
              <Link to="/demo" className="btn btn--ghost btn--lg">View a demo</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer__top">
            <div className="footer__col">
              <Link to="/" className="wordmark">REI<span className="wordmark__accent">flywheel</span></Link>
              <p className="footer__tagline">One link for every door.</p>
            </div>
            <div className="footer__col">
              <h5>Product</h5>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#how">How it works</a></li>
                <li><a href="#">Pricing</a></li>
                <li><Link to="/demo">Example profile</Link></li>
              </ul>
            </div>
            <div className="footer__col">
              <h5>Resources</h5>
              <ul>
                <li><a href="#">Help center</a></li>
                <li><a href="#">Buyer guide</a></li>
                <li><a href="#">Changelog</a></li>
                <li><a href="#">Status</a></li>
              </ul>
            </div>
            <div className="footer__col">
              <h5>Company</h5>
              <ul>
                <li><a href="#">About</a></li>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Privacy</a></li>
                <li><a href="#">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="footer__bottom">
            <span>© 2026 REI Flywheel · All rights reserved.</span>
            <Link to="/login" className="footer__signin">Sign in →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
