import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  adoptPublicWikiPage,
  followPublicCasebook,
  forkPublicCasebook,
  getWikiPublicPreview
} from '../api/wiki';
import { CLOCK_LABEL, VERDICT_LABEL } from './judgmentLedgerClient';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import { describeReturn, readLastSeen, rememberSeen } from './publicReturn';
import '../styles/public-casebook.css';

const months = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]);

const hasAuthToken = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('token') || localStorage.getItem('authToken'));
};

const formatDay = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

const askToSignIn = (navigate, location, intent) => {
  try {
    const params = new URLSearchParams(location?.search || '');
    params.set(intent, '1');
    const returnTo = `${location?.pathname || ''}?${params.toString()}${location?.hash || ''}`;
    sessionStorage.setItem('auth_return_to', returnTo);
    sessionStorage.setItem('auth_redirect_reason', 'auth');
  } catch (_error) {
    /* Sign-in still works without a return path. */
  }
  navigate('/register');
};

const Seal = ({ seal }) => {
  if (!seal?.hash && !seal?.signature) return null;
  const mark = String(seal.signature || seal.hash || '').slice(0, 8);
  return (
    <p className="public-casebook__seal" title={seal.hash || ''}>
      Sealed {formatDay(seal.signedAt) || 'for reading'}
      {mark ? <span> · {mark}</span> : null}
    </p>
  );
};

const LineageTree = ({ lineage }) => {
  if (!lineage?.origin && !lineage?.branches?.length) return null;
  return (
    <section className="public-casebook__tree" aria-label="Lineage">
      <h2>Lineage</h2>
      <ul>
        {lineage.origin ? (
          <li className="is-origin">
            {lineage.origin.slug && !lineage.origin.revoked ? (
              <Link to={`/share/wiki/${encodeURIComponent(lineage.origin.slug)}`}>
                {lineage.origin.title}
              </Link>
            ) : (
              <span>{lineage.origin.title}</span>
            )}
            <small>
              {lineage.origin.action === 'fork' ? 'Forked from' : 'Adopted from'}
              {lineage.origin.revoked ? ' · the origin is no longer public' : ''}
            </small>
          </li>
        ) : (
          <li className="is-origin"><span>This folio</span></li>
        )}
        {(lineage.branches || []).map((branch) => (
          <li key={branch.slug || branch.title} className="is-branch">
            {branch.slug ? (
              <Link to={`/share/wiki/${encodeURIComponent(branch.slug)}`}>{branch.title}</Link>
            ) : (
              <span>{branch.title}</span>
            )}
            <small>
              {branch.action === 'fork' ? 'A fork' : 'An adopted copy'}
              {branch.diverged ? ' · the claim has moved' : ''}
              {branch.at ? ` · ${formatDay(branch.at)}` : ''}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
};

const PublicCasebook = ({
  casebook,
  idOrSlug,
  location,
  onNeedAuth,
  preview = false
}) => {
  const navigate = useNavigate();
  /* What this reader had already seen when they arrived. Read once, before
     the visit is recorded, or the page would always be reporting itself as
     already read. Null means we have never met them, and the page then says
     nothing about it. */
  const [seenOnArrival] = useState(() => readLastSeen(idOrSlug));
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  /* Record the visit after the page has been read, never before it is shown.
     A preview is the owner looking at their own work and is not a visit, so
     it must not consume the reader's next "since you were last here".
     Everything here stays in this browser: no account, no beacon, no write. */
  useEffect(() => {
    if (preview) return;
    rememberSeen(idOrSlug, casebook?.deltas);
  }, [idOrSlug, casebook, preview]);

  const goAuth = useCallback((intent) => {
    if (onNeedAuth) onNeedAuth(intent);
    else askToSignIn(navigate, location, intent);
  }, [location, navigate, onNeedAuth]);

  const run = useCallback(async (intent, work) => {
    if (busy) return;
    setNote('');
    if (!hasAuthToken()) {
      goAuth(intent);
      return;
    }
    setBusy(intent);
    try {
      const result = await work();
      const pageId = result?.page?._id || result?.page?.id;
      if (pageId && (intent === 'fork' || intent === 'adopt')) {
        navigate(wikiPagePath(pageId), { replace: true });
        return;
      }
      if (intent === 'follow') setNote('You are following this case. There is no list of followers.');
    } catch (error) {
      setNote(error?.response?.data?.error || error?.message || 'The paper did not take.');
    } finally {
      setBusy('');
    }
  }, [busy, goAuth, navigate]);

  if (!casebook?.claim?.text) return null;

  const clocks = Array.isArray(casebook.clocks) ? casebook.clocks : [];
  const verdicts = Array.isArray(casebook.verdicts) ? casebook.verdicts : [];
  const postmortems = Array.isArray(casebook.postmortems) ? casebook.postmortems : [];
  const revisions = Array.isArray(casebook.revisions) ? casebook.revisions : [];
  const evidence = Array.isArray(casebook.evidence) ? casebook.evidence : [];
  const deltas = Array.isArray(casebook.deltas) ? casebook.deltas : [];
  const returned = describeReturn({ deltas, lastSeen: seenOnArrival });
  const freshToReader = new Set(returned.ids);
  const corrections = Array.isArray(casebook.corrections) ? casebook.corrections : [];

  return (
    <article className="public-casebook">
      <header className="public-casebook__hero">
        <p className="public-casebook__eyebrow">Public casebook</p>
        <h1>{casebook.claim.text}</h1>
        <p className="public-casebook__meta">
          {casebook.claim.bornAt ? `Held ${formatDay(casebook.claim.bornAt)}` : 'Held'}
          {casebook.acceptedThrough?.at
            ? ` · accepted through ${casebook.acceptedThrough.label || formatDay(casebook.acceptedThrough.at)}`
            : ''}
        </p>
        <Seal seal={casebook.seal} />
      </header>

      {casebook.criterion ? (
        <p className="public-casebook__criterion">{casebook.criterion}</p>
      ) : null}

      {clocks.length ? (
        <section aria-label="Clocks">
          <h2>Clocks</h2>
          <ol className="public-casebook__clocks">
            {clocks.map((fact, index) => (
              <li key={`${fact.clock}-${fact.occurredAt || index}`}>
                <span>{CLOCK_LABEL[fact.clock] || fact.clock}</span>
                <strong>{formatDay(fact.occurredAt) || 'The day is not known'}</strong>
                {fact.summary ? <p>{fact.summary}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {verdicts.length ? (
        <section aria-label="Verdicts">
          <h2>Verdicts</h2>
          <ol>
            {verdicts.map((verdict, index) => (
              <li key={`${verdict.result}-${verdict.recordedAt || index}`}>
                <strong>{verdict.label || VERDICT_LABEL[verdict.result] || verdict.result}</strong>
                {verdict.recordedAt ? <span> · {formatDay(verdict.recordedAt)}</span> : null}
                {verdict.note ? <p>{verdict.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {postmortems.length ? (
        <section aria-label="Postmortems">
          <h2>After the verdict</h2>
          {postmortems.map((row, index) => (
            <div key={`${row.observedAt || index}`}>
              {row.question ? <p className="public-casebook__question">{row.question}</p> : null}
              {row.silent ? <p>Left silent.</p> : null}
              {row.answer ? <p>{row.answer}</p> : null}
              {row.lesson ? <p>{row.lesson}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {revisions.length ? (
        <section aria-label="Revision history">
          <h2>What was written</h2>
          <ol className="public-casebook__revisions">
            {revisions.map((row) => (
              <li key={row.at}>
                <time dateTime={row.at}>{formatDay(row.at)}</time>
                {row.summary ? <span>{row.summary}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {deltas.length ? (
        <section aria-label="Since the last accepted edition">
          <h2>Since the last accepted edition</h2>
          {returned.line ? (
            <p className="public-casebook__returned" role="status">{returned.line}</p>
          ) : null}
          <ol>
            {deltas.map((row) => (
              <li key={row.at} className={freshToReader.has(row.at) ? 'is-new-to-you' : undefined}>
                <time dateTime={row.at}>{formatDay(row.at)}</time>
                <span>{row.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {evidence.length ? (
        <section aria-label="Evidence">
          <h2>Evidence</h2>
          <p className="public-casebook__privacy">Links only. Private passages stay in the library.</p>
          <ol>
            {evidence.map((source) => (
              <li key={source.url || source.title}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a>
                ) : (
                  <span>{source.title}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {corrections.length ? (
        <section aria-label="Corrections">
          <h2>Corrections</h2>
          <ol>
            {corrections.map((row) => (
              <li key={`${row.kind}-${row.at}`}>
                <time dateTime={row.at}>{formatDay(row.at)}</time>
                <span>{row.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <LineageTree lineage={casebook.lineage} />

      {preview ? (
        <p className="public-casebook__privacy">This is the sealed folio. Private notes never leave the case.</p>
      ) : (
      <section className="public-casebook__hands" aria-label="Follow, fork, or adopt">
        <p>Follow watches. Fork branches the claim. Adopt copies the page. None of them keep a count.</p>
        <div>
          <button type="button" onClick={() => run('follow', () => followPublicCasebook(idOrSlug))} disabled={Boolean(busy)}>
            {busy === 'follow' ? 'Following…' : 'Follow'}
          </button>
          <button type="button" onClick={() => run('fork', () => forkPublicCasebook(idOrSlug))} disabled={Boolean(busy)}>
            {busy === 'fork' ? 'Forking…' : 'Fork'}
          </button>
          <button type="button" onClick={() => run('adopt', () => adoptPublicWikiPage(idOrSlug))} disabled={Boolean(busy)}>
            {busy === 'adopt' ? 'Copying…' : 'Adopt'}
          </button>
        </div>
        {note ? <p role="status">{note}</p> : null}
      </section>
      )}
    </article>
  );
};

export default PublicCasebook;
export { formatDay, hasAuthToken };

export const CasebookPreview = ({ pageId }) => {
  const [open, setOpen] = useState(false);
  const [folio, setFolio] = useState(null);
  useEffect(() => {
    if (!open || !pageId) return undefined;
    let cancelled = false;
    getWikiPublicPreview(pageId)
      .then((payload) => {
        if (!cancelled) setFolio(payload?.casebook || null);
      })
      .catch(() => {
        if (!cancelled) setFolio(null);
      });
    return () => { cancelled = true; };
  }, [open, pageId]);
  if (!pageId) return null;
  return (
    <details
      className="public-casebook-preview"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>What a visitor would see</summary>
      {open && folio ? <PublicCasebook casebook={folio} idOrSlug={pageId} preview /> : null}
      {open && !folio ? <p className="public-casebook__privacy">Nothing public is sealed yet.</p> : null}
    </details>
  );
};
