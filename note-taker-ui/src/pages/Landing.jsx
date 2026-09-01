import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { getPublicProofRegistry } from '../api/wiki';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import { buildMarketingHref } from '../utils/marketingAttribution';
import { normalizePublicProofRegistry } from '../utils/maintenanceProof';
import '../styles/landing-scale.css';

const Landing = () => {
  const navigate = useNavigate();
  const hasToken = Boolean(localStorage.getItem('token'));
  const [livingDossierHref, setLivingDossierHref] = useState('/proof');

  const markLandingSeen = () => {
    localStorage.setItem('hasSeenLanding', 'true');
  };

  const handleEnter = () => {
    markLandingSeen();
    if (hasToken) {
      navigate('/wiki');
    } else {
      navigate('/login');
    }
  };

  useEffect(() => {
    let cancelled = false;
    getPublicProofRegistry()
      .then((payload) => {
        if (cancelled) return;
        const registry = normalizePublicProofRegistry(payload);
        if (registry.homepageCta?.href) {
          setLivingDossierHref(registry.homepageCta.href);
        }
      })
      .catch(() => {
        // Keep the gallery fallback when the registry is not yet published.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing-public">
      <header className="landing-public__masthead">
        <div className="landing-public__brand-block">
          <Link to="/" className="landing-public__brand">Noeis</Link>
          <p className="landing-public__brand-copy">Source-grounded personal research wiki for serious readers.</p>
        </div>
        <nav className="landing-public__nav" aria-label="Public navigation">
          <Link to="/guides">Guides</Link>
          <Link to="/proof">Living dossiers</Link>
          <Link to="/examples">Examples</Link>
          <Link to="/ai-second-brain">AI second brain</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/login">Login</Link>
        </nav>
      </header>

      <section className="landing-public__hero">
        <div className="landing-public__rail">
          <div className="landing-public__eyebrow">Source-grounded personal research wiki</div>
          <p>
            A research workspace for people who read more than they can remember. Reading becomes
            pages with their sources attached, and pages become claims you have actually committed
            to.
          </p>
        </div>

        <div className="landing-public__main">
          <h1>Saved reading becomes a source-grounded wiki. The wiki becomes judgments you can be held to.</h1>
          <p className="landing-public__lede">
            Noeis keeps your articles, highlights, pages, and notes in one place, and asks you to
            write down what you believe, what argues against it, and what would change your mind.
            An agent brings evidence overnight. Nothing is written until you accept it.
          </p>
          <div className="landing-public__actions">
            <Button
              onClick={() => {
                markLandingSeen();
                trackMarketingCta({ page: 'home', cta: 'hero', target: '/register', pageType: 'home' });
                navigate(buildMarketingHref('/register', {
                  entry: 'home',
                  cta: 'hero',
                  pageType: 'home'
                }));
              }}
            >
              Get started
            </Button>
            <Button variant="secondary" onClick={() => document.getElementById('tour')?.scrollIntoView({ behavior: 'smooth' })}>
              See the tour
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                trackMarketingCta({ page: 'home', cta: 'living-dossier', target: livingDossierHref, pageType: 'home' });
                navigate(livingDossierHref);
              }}
              /* The target is resolved from the proof registry after paint, so
                 until it lands this button points at the gallery fallback.
                 Saying where it currently goes makes that settling observable
                 instead of invisible - to a reader inspecting the page, and to
                 a test that would otherwise have to guess when to click. */
              data-target={livingDossierHref}
            >
              Open a living dossier
            </Button>
          </div>
        </div>

        <aside className="landing-public__aside">
          <div className="landing-public__eyebrow">What changes</div>
          <ul className="landing-public__mini-list">
            <li>Highlights stay attached to source and context.</li>
            <li>A claim carries its counterargument and what would change your mind.</li>
            <li>The agent proposes. Nothing enters a page until you accept it.</li>
          </ul>
        </aside>
      </section>

      <section className="landing-public__strip">
        <div>
          <span>Read</span>
          <p>Save articles, highlights, and notes without losing where they came from.</p>
        </div>
        <div>
          <span>Build</span>
          <p>Turn what you saved into wiki pages that carry their evidence.</p>
        </div>
        <div>
          <span>Judge</span>
          <p>Write the claim, what argues against it, and what would change your mind.</p>
        </div>
      </section>

      <section className="landing-public__details" id="tour">
        <div className="landing-public__column">
          <div className="landing-public__section-kicker">For people who read seriously</div>
          <h2>The system is built for return, not just capture.</h2>
          <ul className="landing-public__detail-list">
            <li>You read a lot and want to find the right idea again fast.</li>
            <li>You highlight constantly, then lose what the highlight was for.</li>
            <li>You change your mind and want to know, later, why you did.</li>
            <li>You want an assistant that brings evidence, not one that writes your conclusions.</li>
          </ul>
        </div>

        <div className="landing-public__column">
          <div className="landing-public__section-kicker">Five-minute tour</div>
          <ol className="landing-public__detail-list landing-public__detail-list--ordered">
            <li>Save an article into the Library.</li>
            <li>Highlight what matters; the text stays attached to its source.</li>
            <li>Build a wiki page from what you saved, with the sources on it.</li>
            <li>Write a claim — why you believe it, what argues against it, what would change your mind.</li>
            <li>Open Noeis tomorrow. The paper says what changed overnight and what is waiting.</li>
          </ol>
        </div>
      </section>

      <section className="landing-public__support">
        <div>
          <div className="landing-public__section-kicker">Research guides</div>
          <p>Read the practical guide to what an AI second brain should actually do.</p>
          <div className="landing-public__inline-links">
            <Link to="/guides">Browse guides</Link>
            <Link to="/proof">Living dossiers</Link>
            <Link to="/examples">Examples</Link>
            <Link to="/ai-second-brain">AI second brain</Link>
            <Link to="/second-brain-app">Second brain app</Link>
          </div>
        </div>
        <div>
          <div className="landing-public__section-kicker">Ownership</div>
          <p>Export your data anytime. No lock-in. The agent’s work is always shown before it lands.</p>
        </div>
        <div>
          <div className="landing-public__section-kicker">Enter</div>
          <p>If the workflow fits your brain, you should know quickly.</p>
          <Button
            onClick={() => {
              if (!hasToken) {
                trackMarketingCta({ page: 'home', cta: 'footer', target: '/login', pageType: 'home' });
              }
              handleEnter();
            }}
          >
            Enter Noeis
          </Button>
        </div>
      </section>

      <footer className="landing-public__footer">
        <p>If this looks like how you already work, the product should feel legible on the first day.</p>
        <div className="landing-public__footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Use</Link>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
