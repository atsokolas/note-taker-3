import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adoptWikiStarterPack, listWikiStarterPacks } from '../api/wiki';
import { markWikiOnboardingComplete } from './onboardingState';

/**
 * ForkableWikis — public wikis you can copy into your own workspace.
 *
 * These have had an API since before this work and no face anywhere in the product,
 * so forking one was only possible from a share link somebody handed you.
 *
 * Note the layer boundary, which the copy has to be honest about: you fork the
 * *wiki* — pages, claims, internal links. You never inherit anyone's library. The
 * sources underneath stay yours to build, which is exactly why the copy is inert
 * until you feed it.
 */

const hasAuthToken = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('token') || localStorage.getItem('authToken'));
};

const ForkableWikis = () => {
  const navigate = useNavigate();
  const [packs, setPacks] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listWikiStarterPacks()
      .then((items) => {
        if (!cancelled && Array.isArray(items)) setPacks(items);
      })
      .catch(() => {
        // A public page should not shout about a failed optional fetch; the section
        // simply does not render.
        if (!cancelled) setPacks([]);
      });
    return () => { cancelled = true; };
  }, []);

  const fork = useCallback(async (pack) => {
    setError('');
    if (!hasAuthToken()) {
      try {
        sessionStorage.setItem('auth_return_to', `/proof#fork-${pack.id}`);
      } catch (_error) {
        // Return state is a convenience; signing up still works without it.
      }
      navigate('/register');
      return;
    }
    setBusyId(pack.id);
    try {
      const result = await adoptWikiStarterPack(pack.id);
      const first = (Array.isArray(result?.pages) ? result.pages : [])[0] || {};
      const pageId = first._id || first.id || '';
      markWikiOnboardingComplete();
      navigate(
        pageId
          ? `/onboarding/wiki?adoptedPage=${encodeURIComponent(pageId)}&source=shared`
          : '/wiki',
        { replace: true }
      );
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not copy that wiki. Try again.');
    } finally {
      setBusyId('');
    }
  }, [navigate]);

  if (!packs.length) return null;

  return (
    <section className="forkable-wikis" aria-labelledby="forkable-wikis-heading">
      <div className="forkable-wikis__intro">
        <p className="muted-label">Start from someone else&apos;s</p>
        <h2 id="forkable-wikis-heading">Wikis you can make your own.</h2>
        <p className="muted">
          Copy the pages into your workspace and they start being maintained against
          your reading. The original keeps its version; your copy diverges as you feed it.
        </p>
      </div>
      <div className="forkable-wikis__grid" role="list">
        {packs.map(pack => (
          <article className="forkable-wikis__card" role="listitem" key={pack.id} id={`fork-${pack.id}`}>
            <div className="forkable-wikis__card-topline">
              <span>{pack.pageCount || (pack.pages || []).length} pages</span>
            </div>
            <h3>{pack.name}</h3>
            {pack.tagline || pack.description ? <p>{pack.tagline || pack.description}</p> : null}
            {/* Show exactly what a fork would create, before asking for anything. */}
            {Array.isArray(pack.pages) && pack.pages.length ? (
              <ul className="forkable-wikis__pages">
                {pack.pages.slice(0, 5).map(page => <li key={page.id || page.slug}>{page.title}</li>)}
                {pack.pages.length > 5 ? <li className="is-more">and {pack.pages.length - 5} more</li> : null}
              </ul>
            ) : null}
            <button
              type="button"
              className="forkable-wikis__cta"
              onClick={() => fork(pack)}
              disabled={busyId === pack.id}
            >
              {busyId === pack.id ? 'Making a copy…' : 'Make this mine'}
            </button>
          </article>
        ))}
      </div>
      {error ? <p className="forkable-wikis__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default ForkableWikis;
