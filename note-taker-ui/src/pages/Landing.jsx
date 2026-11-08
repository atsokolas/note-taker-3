import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { getPublicProofRegistry } from '../api/wiki';
import { usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import useSeoMetadata from '../hooks/useSeoMetadata';
import HOME from '../seo/homeCopy.json';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import { buildMarketingHref } from '../utils/marketingAttribution';
import { normalizePublicProofRegistry } from '../utils/maintenanceProof';
import '../styles/landing-scale.css';

const scrollToId = (id, reduced) => {
  const node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
};

const Landing = () => {
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const hasToken = Boolean(localStorage.getItem('token'));
  const [livingDossierHref, setLivingDossierHref] = useState('/proof');

  useSeoMetadata({
    title: HOME.title,
    description: HOME.description,
    canonicalPath: '/',
    ogType: 'website'
  });

  const markLandingSeen = () => {
    localStorage.setItem('hasSeenLanding', 'true');
  };

  const start = (cta) => {
    markLandingSeen();
    if (hasToken) {
      navigate('/wiki');
      return;
    }
    trackMarketingCta({ page: 'home', cta, target: '/register', pageType: 'home' });
    navigate(buildMarketingHref('/register', {
      entry: 'home',
      cta,
      pageType: 'home'
    }));
  };

  const seeHow = (event) => {
    if (event) event.preventDefault();
    scrollToId('how-it-works', reducedMotion);
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
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="landing-public">
      <header className="landing-public__masthead">
        <Link to="/" className="landing-public__brand">Noeis</Link>
        <nav className="landing-public__nav" aria-label="Public navigation">
          <a href="#how-it-works" onClick={seeHow}>How it works</a>
          <Link to="/examples">Examples</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </header>

      <section className="landing-public__hero">
        <div className="landing-public__main">
          <p className="landing-public__eyebrow">{HOME.eyebrow}</p>
          <h1>{HOME.headline}</h1>
          <p className="landing-public__lede">{HOME.lede}</p>
          <div className="landing-public__actions">
            <Button variant="primary" onClick={() => start('hero')}>{HOME.primaryCta.label}</Button>
            <Button onClick={seeHow}>{HOME.secondaryCta.label}</Button>
          </div>
        </div>
        <figure className="landing-public__specimen" aria-label={HOME.specimen.label}>
          <p className="landing-public__eyebrow">{HOME.specimen.kicker}</p>
          <p className="landing-public__specimen-title">{HOME.specimen.title}</p>
          <figcaption>{HOME.specimen.grew}</figcaption>
          <ol className="landing-public__specimen-entries">
            {HOME.specimen.entries.map(({ when, line, source }) => (
              <li key={when}>
                <time>{when}</time>
                <p>{line}<small>{source}</small></p>
              </li>
            ))}
          </ol>
        </figure>
      </section>

      <section className="landing-public__strip" id="how-it-works" aria-label="How it works">
        {HOME.statements.map((statement) => (
          <div key={statement.title}>
            <span>{statement.title}</span>
            <p>{statement.copy}</p>
          </div>
        ))}
      </section>

      <section className="landing-public__support">
        <div>
          <Button variant="primary" onClick={() => start('footer')}>{HOME.primaryCta.label}</Button>
        </div>
      </section>

      <footer className="landing-public__footer">
        <nav className="landing-public__footer-links" aria-label="More">
          <Link to="/guides">Guides</Link>
          <Link to="/examples">Examples</Link>
          <Link to="/ai-second-brain">AI second brain</Link>
          <a href="/skill.md">Connect an agent</a>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <button
            type="button"
            className="landing-public__proof"
            onClick={() => {
              trackMarketingCta({
                page: 'home',
                cta: 'living-dossier',
                target: livingDossierHref,
                pageType: 'home'
              });
              navigate(livingDossierHref);
            }}
            data-target={livingDossierHref}
          >
            Open a living dossier
          </button>
        </nav>
      </footer>
    </div>
  );
};

export default Landing;
