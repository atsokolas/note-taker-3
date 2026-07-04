import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import { buildMarketingHref } from '../utils/marketingAttribution';

const Landing = () => {
  const navigate = useNavigate();
  const hasToken = Boolean(localStorage.getItem('token'));

  const markLandingSeen = () => {
    localStorage.setItem('hasSeenLanding', 'true');
  };

  const handleEnter = () => {
    markLandingSeen();
    if (hasToken) {
      navigate('/today');
    } else {
      navigate('/login');
    }
  };

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
            A research workspace for people who save too much, think in fragments, and want reading
            to become pages, drafts, and decisions with sources attached.
          </p>
        </div>

        <div className="landing-public__main">
          <h1>Saved reading becomes a source-grounded wiki. The wiki becomes drafts, decisions, and reusable insight.</h1>
          <p className="landing-public__lede">
            Noeis keeps articles, highlights, wiki pages, working drafts, concepts, and question
            threads in one calm workspace so your thinking can compound without losing the evidence
            underneath it.
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
            <Button variant="secondary" onClick={() => navigate('/proof')}>
              See a living dossier
            </Button>
          </div>
        </div>

        <aside className="landing-public__aside">
          <div className="landing-public__eyebrow">What changes</div>
          <ul className="landing-public__mini-list">
            <li>Highlights stay attached to source and context.</li>
            <li>Wiki pages gather evidence before they become manuscripts.</li>
            <li>Questions stay visible until something actually resolves them.</li>
          </ul>
        </aside>
      </section>

      <section className="landing-public__strip">
        <div>
          <span>Capture</span>
          <p>Save articles, highlights, and notes without losing provenance.</p>
        </div>
        <div>
          <span>Shape</span>
          <p>Turn fragments into notebook drafts and concept workbenches.</p>
        </div>
        <div>
          <span>Clarify</span>
          <p>Keep open questions, related evidence, and contradictions in view.</p>
        </div>
      </section>

      <section className="landing-public__details" id="tour">
        <div className="landing-public__column">
          <div className="landing-public__section-kicker">For people who read seriously</div>
          <h2>The system is built for return, not just capture.</h2>
          <ul className="landing-public__detail-list">
            <li>You read a lot and want to find the right idea again fast.</li>
            <li>You highlight constantly, then lose what the highlight was for.</li>
            <li>You want concepts and questions to evolve instead of reset every week.</li>
            <li>You want AI support without giving up human judgment.</li>
          </ul>
        </div>

        <div className="landing-public__column">
          <div className="landing-public__section-kicker">Five-minute tour</div>
          <ol className="landing-public__detail-list landing-public__detail-list--ordered">
            <li>Save an article into the library.</li>
            <li>Highlight what matters and keep the text attached to source.</li>
            <li>Pull useful fragments into notes, concepts, or questions.</li>
            <li>Ask the partner to sort, challenge, or contextualize the evidence.</li>
            <li>Come back later through the return queue instead of starting over.</li>
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
          <p>Export your data anytime. No lock-in. AI stays optional and reviewable.</p>
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
