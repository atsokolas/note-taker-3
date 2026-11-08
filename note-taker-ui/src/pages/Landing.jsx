import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useSeoMetadata from '../hooks/useSeoMetadata';
import HOME from '../seo/homeCopy.json';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import { buildMarketingHref } from '../utils/marketingAttribution';
import '../styles/landing-scale.css';

/* One page, read top to bottom: what Noeis is, the one way in, a page of a
   reader's wiki to show it, and the three things that make it add up. */
const Landing = () => {
  const navigate = useNavigate();

  useSeoMetadata({
    title: HOME.title,
    description: HOME.description,
    canonicalPath: '/',
    ogType: 'website'
  });

  const start = () => {
    if (localStorage.getItem('token')) return navigate('/wiki');
    trackMarketingCta({ page: 'home', cta: 'hero', target: '/register', pageType: 'home' });
    navigate(buildMarketingHref('/register', { entry: 'home', cta: 'hero', pageType: 'home' }));
  };

  const { specimen } = HOME;

  return (
    <div className="landing-public">
      <header className="landing-public__masthead">
        <Link to="/" className="landing-public__brand">Noeis</Link>
        <nav aria-label="Public navigation">
          <Link to="/examples">Examples</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </header>

      <main>
        <section className="landing-public__hero">
          <h1>{HOME.headline}</h1>
          <p>{HOME.lede}</p>
          <button type="button" className="landing-public__start" onClick={start}>
            {HOME.primaryCta.label}
          </button>
        </section>

        <figure className="landing-public__specimen" aria-label={specimen.title}>
          <h2>{specimen.title}</h2>
          <figcaption>{specimen.grew}</figcaption>
          <ol>
            {specimen.entries.map(({ when, line, source }) => (
              <li key={when}>
                <time>{when}</time>
                <p>{line}<small>{source}</small></p>
              </li>
            ))}
          </ol>
        </figure>

        <dl className="landing-public__statements">
          {HOME.statements.map(({ title, copy }) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{copy}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="landing-public__footer">
        <Link to="/guides">Guides</Link>
        <Link to="/examples">Examples</Link>
        <a href="/skill.md">Connect an agent</a>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </footer>
    </div>
  );
};

export default Landing;
