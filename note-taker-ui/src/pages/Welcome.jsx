import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  createWikiPage,
  getJudgmentLibraryEvidence,
  getWikiPage,
  listWikiPages,
  updateWikiPage
} from '../api/wiki';
import { getArticles } from '../api/articles';
import {
  connectReadwiseToken,
  importPastedText,
  importPastedUrl,
  syncReadwiseConnection
} from '../api/imports';
import { isOnboardingComplete, markOnboardingComplete } from '../onboarding/onboardingState';
import useExtensionPresence, { EXTENSION_STATE } from '../onboarding/useExtensionPresence';
import { TOUR_EXTENSION_URL } from '../tour/tourConfig';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import { createJudgment, fileEvidenceIntoJudgment, oneSentence, sourceHrefFromOrigin } from './judgmentModel';
import {
  EXAMPLE_VIEWS,
  FILED_LINE,
  READWISE_TOKEN_URL,
  STEPS,
  extraSentenceNotice,
  linkLabel,
  markMatches,
  passageTitle,
  passagesHeadline,
  readPastedReading,
  readwiseReceipt,
  savedOn,
  viewProblem
} from './welcomeModel';
import '../styles/welcome.css';

/**
 * First run: hold a view, bring your reading, see what it says.
 *
 * The first five minutes have one job, which is to reach the product's own
 * moment: something you already saved, quoted, bearing on something you think.
 * No tour and no sample pages. Every screen is about the reader's own sentence
 * and their own reading, and the last one lands on the view they just made,
 * with what they filed already on it.
 *
 * The URL is the state (?step=…&view=…), so Back walks back through the steps,
 * a refresh resumes where you were, and leaving for Readwise's token page in
 * another tab costs nothing.
 */

const MAX_LINKS = 10;
const stepIndex = id => Math.max(0, STEPS.findIndex(step => step.id === id));
const messageFrom = (error, fallback) => error?.response?.data?.error || fallback;

const Welcome = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = STEPS.some(item => item.id === params.get('step')) ? params.get('step') : 'view';
  const viewId = params.get('view') || '';
  const took = params.get('took') || '';
  const [view, setView] = useState(null);
  const [arrivals, setArrivals] = useState([]);
  const [readwise, setReadwise] = useState(null);

  const go = useCallback((nextStep, { id = viewId, replace = false } = {}) => {
    const next = new URLSearchParams();
    next.set('step', nextStep);
    if (id) next.set('view', id);
    if (took) next.set('took', took);
    setParams(next, { replace });
    window.scrollTo?.(0, 0);
  }, [setParams, took, viewId]);

  const finish = useCallback((destination) => {
    markOnboardingComplete();
    navigate(destination, { replace: true });
  }, [navigate]);

  /* A reader past first run who took a shared wiki goes to what they took.
     Only a new account is asked what it thinks. */
  useEffect(() => {
    if (took && isOnboardingComplete()) navigate(wikiPagePath(took), { replace: true });
  }, [navigate, took]);

  /* The view in the URL, read back. Without one, past the first step, the
     newest view this account holds — a reader who held one and closed the tab
     picks up from it rather than holding a second. */
  useEffect(() => {
    if (step === 'view' && !viewId) return undefined;
    if (view?.id && view.id === viewId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let id = viewId;
        if (!id) {
          const pages = await listWikiPages({ projection: 'judgment', limit: 20 });
          const held = (Array.isArray(pages) ? pages : [])
            .filter(page => page?.judgment?.currentJudgment)
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
          id = held?._id || '';
        }
        if (!id) {
          if (!cancelled) go('view', { id: '', replace: true });
          return;
        }
        const page = await getWikiPage(id);
        if (cancelled) return;
        const sentence = page?.judgment?.currentJudgment || '';
        if (!sentence) {
          go('view', { id: '', replace: true });
          return;
        }
        setView({ id, sentence, page });
        if (id !== viewId) go(step, { id, replace: true });
      } catch (_error) {
        if (!cancelled) go('view', { id: '', replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [go, step, view?.id, viewId]);

  const current = stepIndex(step);
  const ready = step === 'view' || (view && view.id === viewId);

  return (
    <main className="welcome" aria-labelledby="welcome-title">
      <header className="welcome__bar">
        <span className="welcome__brand">Noeis</span>
        <ol className="welcome__steps" aria-label="First run">
          {STEPS.map((item, index) => (
            <li
              key={item.id}
              className={index < current ? 'is-done' : ''}
              aria-current={index === current ? 'step' : undefined}
            >
              {item.label}
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="welcome__skip"
          onClick={() => finish(view ? `/judgment/${view.id}` : '/library')}
        >
          Skip for now
        </button>
      </header>

      <div className="welcome__column" key={step}>
        {step !== 'view' && view ? (
          <p className="welcome__held">
            <span>You hold</span>
            {view.sentence}
          </p>
        ) : null}

        {!ready ? <p className="welcome__quiet" role="status">Opening your view…</p> : null}

        {ready && step === 'view' ? (
          <ViewStep
            took={took}
            initial={view?.sentence || ''}
            onHeld={(held) => {
              setView(held);
              go('reading', { id: held.id });
            }}
          />
        ) : null}

        {ready && step === 'reading' ? (
          <ReadingStep
            arrivals={arrivals}
            setArrivals={setArrivals}
            readwise={readwise}
            setReadwise={setReadwise}
            onNext={() => go('moment')}
            onLater={() => finish(`/judgment/${view.id}`)}
          />
        ) : null}

        {ready && step === 'moment' ? (
          <MomentStep
            view={view}
            setView={setView}
            onReading={() => go('reading')}
            onAnotherView={() => {
              setView(null);
              go('view', { id: '' });
            }}
            onFinish={() => finish(`/judgment/${view.id}`)}
          />
        ) : null}
      </div>
    </main>
  );
};

/* ------------------------------------------------------------------ 1 */

const ViewStep = ({ took, initial, onHeld }) => {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef(null);
  const notice = extraSentenceNotice(draft);

  /* The field grows to the sentence. */
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [draft]);

  useEffect(() => { fieldRef.current?.focus(); }, []);

  const borrow = (example) => {
    setDraft(example);
    setError('');
    window.requestAnimationFrame?.(() => {
      const field = fieldRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(example.length, example.length);
    });
  };

  const hold = async (event) => {
    event?.preventDefault?.();
    if (busy || !oneSentence(draft)) return;
    const problem = viewProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const held = await createJudgment(draft, { createPage: createWikiPage, updatePage: updateWikiPage });
      onHeld({ id: held.id, sentence: held.sentence, page: null });
    } catch (holdError) {
      setError(messageFrom(holdError, 'That did not save. Try once more.'));
      setBusy(false);
    }
  };

  return (
    <form className="welcome__step" onSubmit={hold}>
      {took ? <p className="welcome__receipt">The wiki you took is in your Wiki now.</p> : null}
      <h1 id="welcome-title">What do you think is true?</h1>
      <p className="welcome__lede">
        One sentence about something you have read your way into: a company, a habit, a field.
        Noeis will read what you have saved against it.
      </p>
      <label className="sr-only" htmlFor="welcome-view">Your view</label>
      <textarea
        id="welcome-view"
        ref={fieldRef}
        className="welcome__view-field"
        rows={1}
        value={draft}
        enterKeyHint="done"
        placeholder="One sentence you think is true."
        onChange={(event) => { setDraft(event.target.value); setError(''); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) hold(event);
        }}
      />
      {notice ? <p className="welcome__hint">{notice}</p> : null}
      {error ? <p className="welcome__error" role="alert">{error}</p> : null}
      <div className="welcome__actions">
        <button type="submit" className="welcome__primary" disabled={busy || !oneSentence(draft)}>
          {busy ? 'Holding it…' : 'Hold it'}
        </button>
      </div>
      <div className="welcome__examples">
        <p>Or start from one of these and make it yours:</p>
        <ul>
          {EXAMPLE_VIEWS.map(example => (
            <li key={example}>
              <button type="button" onClick={() => borrow(example)}>{example}</button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
};

/* ------------------------------------------------------------------ 2 */

const ReadingStep = ({ arrivals, setArrivals, readwise, setReadwise, onNext, onLater }) => {
  const [token, setToken] = useState('');
  const [readwiseBusy, setReadwiseBusy] = useState(false);
  const [readwiseError, setReadwiseError] = useState('');
  const [pasted, setPasted] = useState('');
  const [pasteProblem, setPasteProblem] = useState('');
  const [libraryHasReading, setLibraryHasReading] = useState(false);

  /* Coming back to this step, or to first run after a few saves elsewhere:
     reading already in the library counts. */
  useEffect(() => {
    let cancelled = false;
    getArticles({ limit: 1 })
      .then((articles) => {
        if (!cancelled) setLibraryHasReading(Array.isArray(articles) && articles.length > 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const arrived = arrivals.filter(item => item.status === 'in').length;
  const reading = arrivals.some(item => item.status === 'reading');
  const hasReading = libraryHasReading || arrived > 0 || (readwise?.importedArticles || 0) > 0;

  const bringReadwise = async (event) => {
    event.preventDefault();
    const apiToken = token.trim();
    if (!apiToken || readwiseBusy) return;
    setReadwiseBusy(true);
    setReadwiseError('');
    try {
      const connection = await connectReadwiseToken({ apiToken });
      const result = await syncReadwiseConnection({ connectionId: connection?._id || connection?.id });
      setReadwise(result);
      setToken('');
    } catch (error) {
      setReadwiseError(error?.response?.status === 400
        ? 'Readwise did not accept that token. Copy it again from readwise.io/access_token.'
        : messageFrom(error, 'Readwise could not be reached. Try again in a moment.'));
    } finally {
      setReadwiseBusy(false);
    }
  };

  const update = (key, patch) => setArrivals(list => list.map(item => (item.key === key ? { ...item, ...patch } : item)));

  const addPasted = async (event) => {
    event.preventDefault();
    const { urls, prose, problem } = readPastedReading(pasted);
    if (problem) {
      setPasteProblem(problem);
      return;
    }
    setPasteProblem(urls.length > MAX_LINKS ? `Noeis took the first ${MAX_LINKS}. Add the rest from Library later.` : '');
    const stamp = Date.now();
    const jobs = prose
      ? [{ key: `text-${stamp}`, label: passageTitle(prose), run: () => importPastedText({ text: prose, title: passageTitle(prose) }) }]
      : urls.slice(0, MAX_LINKS).map(url => ({
        key: `${url}-${stamp}`,
        label: linkLabel(url),
        run: () => importPastedUrl({ url })
      }));
    setArrivals(list => [...list, ...jobs.map(({ key, label }) => ({ key, label, status: 'reading' }))]);
    setPasted('');
    await Promise.all(jobs.map(async (job) => {
      try {
        const result = await job.run();
        update(job.key, { status: 'in', label: result?.article?.title || job.label });
      } catch (error) {
        update(job.key, {
          status: 'failed',
          detail: error?.response?.status === 422
            ? 'This page has no readable text. Paste a few paragraphs of it instead.'
            : 'This page could not be read. Paste a few paragraphs of it instead.'
        });
      }
    }));
  };

  return (
    <section className="welcome__step">
      <h1 id="welcome-title">Bring what you have read.</h1>
      <p className="welcome__lede">
        Noeis looks through it for passages that bear on your view. Your library is yours alone.
      </p>

      <form className="welcome__source" onSubmit={bringReadwise}>
        <h2>From Readwise</h2>
        <p>
          Paste your access token and every highlight comes in, with its source.{' '}
          <a href={READWISE_TOKEN_URL} target="_blank" rel="noopener noreferrer">Get your token</a>
        </p>
        <div className="welcome__inline">
          <label className="sr-only" htmlFor="welcome-readwise">Readwise access token</label>
          <input
            id="welcome-readwise"
            type="text"
            value={token}
            autoComplete="off"
            spellCheck={false}
            placeholder="Readwise access token"
            onChange={(event) => { setToken(event.target.value); setReadwiseError(''); }}
          />
          <button type="submit" disabled={readwiseBusy || !token.trim()}>
            {readwiseBusy ? 'Bringing them in…' : 'Bring them in'}
          </button>
        </div>
        {readwiseBusy ? <p className="welcome__hint" role="status">A large library takes a minute.</p> : null}
        {readwise ? <p className="welcome__receipt" role="status">{readwiseReceipt(readwise)}</p> : null}
        {readwiseError ? <p className="welcome__error" role="alert">{readwiseError}</p> : null}
      </form>

      <form className="welcome__source" onSubmit={addPasted}>
        <h2>Or paste links</h2>
        <label className="sr-only" htmlFor="welcome-links">Links to things you have read</label>
        <textarea
          id="welcome-links"
          rows={3}
          value={pasted}
          placeholder="A few things you have read, one link per line. Or paste a few paragraphs of one."
          onChange={(event) => { setPasted(event.target.value); setPasteProblem(''); }}
        />
        <div className="welcome__actions">
          <button type="submit" disabled={!pasted.trim()}>Add them</button>
        </div>
        {pasteProblem ? <p className="welcome__hint" role="alert">{pasteProblem}</p> : null}
        {arrivals.length ? (
          <ul className="welcome__arrivals" aria-live="polite">
            {arrivals.map(item => (
              <li key={item.key} className={`is-${item.status}`}>
                <span>{item.label}</span>
                <small>
                  {item.status === 'reading' ? 'reading…' : null}
                  {item.status === 'in' ? 'in your library' : null}
                  {item.status === 'failed' ? item.detail : null}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div className="welcome__actions welcome__actions--end">
        <button type="button" className="welcome__primary" disabled={!hasReading || reading} onClick={onNext}>
          See what it says
        </button>
        <button type="button" className="welcome__quiet-action" onClick={onLater}>
          I will bring reading later
        </button>
      </div>
      {!hasReading && !reading ? <p className="welcome__hint">Bring at least one source first.</p> : null}
    </section>
  );
};

/* ------------------------------------------------------------------ 3 */

const MomentStep = ({ view, setView, onReading, onAnotherView, onFinish }) => {
  const [candidates, setCandidates] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filed, setFiled] = useState({});
  const [busyId, setBusyId] = useState('');
  const [fileError, setFileError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setCandidates(null);
    setFailed(false);
    getJudgmentLibraryEvidence(view.id, { limit: 8 })
      .then((found) => { if (!cancelled) setCandidates(found.candidates); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt, view.id]);

  const file = async (candidate, field) => {
    if (busyId) return;
    setFileError('');
    if (field === 'skip') {
      setFiled(current => ({ ...current, [candidate.id]: 'skip' }));
      return;
    }
    setBusyId(candidate.id);
    try {
      const page = view.page || await getWikiPage(view.id);
      const judgment = fileEvidenceIntoJudgment(page, candidate, field);
      const saved = await updateWikiPage(view.id, { judgment });
      const before = (page?.judgment?.[field] || []).length;
      if ((saved?.judgment?.[field] || []).length <= before) throw new Error('not saved');
      setView(current => ({ ...current, page: saved }));
      setFiled(current => ({ ...current, [candidate.id]: field }));
    } catch (_error) {
      setFileError('That did not save. It is still here; try again.');
    } finally {
      setBusyId('');
    }
  };

  if (failed) {
    return (
      <section className="welcome__step">
        <h1 id="welcome-title">Your library could not be read just now.</h1>
        <div className="welcome__actions">
          <button type="button" className="welcome__primary" onClick={() => setAttempt(n => n + 1)}>Try again</button>
        </div>
      </section>
    );
  }

  if (!candidates) {
    return (
      <section className="welcome__step" aria-busy="true">
        <h1 id="welcome-title" className="welcome__reading">Reading your library against it…</h1>
      </section>
    );
  }

  if (!candidates.length) {
    return (
      <section className="welcome__step">
        <h1 id="welcome-title">Nothing you brought speaks to this yet.</h1>
        <p className="welcome__lede">
          That is an answer too: your reading and this view have not met. Bring one more source
          that argues about it, or hold another view.
        </p>
        <div className="welcome__actions">
          <button type="button" className="welcome__primary" onClick={onReading}>Bring one more source</button>
          <button type="button" onClick={onAnotherView}>Hold another view</button>
          <button type="button" className="welcome__quiet-action" onClick={onFinish}>Open your view anyway</button>
        </div>
      </section>
    );
  }

  const filedCount = Object.values(filed).filter(field => field !== 'skip').length;

  return (
    <section className="welcome__step">
      <h1 id="welcome-title">{passagesHeadline(candidates.length)}</h1>
      <p className="welcome__lede">Decide what each one does to your view. Noeis finds; you judge.</p>
      <ol className="welcome__passages">
        {candidates.map((candidate) => {
          const verdict = filed[candidate.id];
          const href = sourceHrefFromOrigin(candidate.id, candidate.url);
          const meta = [candidate.sourceLabel, savedOn(candidate.savedAt)].filter(Boolean).join(' · ');
          return (
            <li key={candidate.id} className={verdict ? `is-filed is-${verdict}` : ''}>
              <blockquote>
                {markMatches(candidate.text, candidate.matched).map((segment, index) => (
                  segment.match
                    ? <mark key={index}>{segment.text}</mark>
                    : <React.Fragment key={index}>{segment.text}</React.Fragment>
                ))}
              </blockquote>
              <p className="welcome__passage-meta">
                {meta}
                {href ? (
                  <>
                    {meta ? ' · ' : ''}
                    <a href={href} target="_blank" rel="noopener noreferrer">Open where it came from</a>
                  </>
                ) : null}
              </p>
              {verdict ? (
                <p className="welcome__verdict" role="status">{FILED_LINE[verdict]}</p>
              ) : (
                <div className="welcome__file">
                  <button type="button" disabled={Boolean(busyId)} onClick={() => file(candidate, 'why')}>Supports it</button>
                  <button type="button" disabled={Boolean(busyId)} onClick={() => file(candidate, 'against')}>Cuts against it</button>
                  <button type="button" disabled={Boolean(busyId)} className="welcome__quiet-action" onClick={() => file(candidate, 'skip')}>
                    Not about this
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {fileError ? <p className="welcome__error" role="alert">{fileError}</p> : null}
      <div className="welcome__actions welcome__actions--end">
        <button type="button" className="welcome__primary" onClick={onFinish}>Open your view</button>
      </div>
      <p className="welcome__hint">
        {filedCount
          ? 'What you filed is on it. Save more and open it again: Noeis looks each time.'
          : 'Save more and open it again: Noeis looks each time.'}
      </p>
      <ExtensionLine />
    </section>
  );
};

/* One line, and only while it is true that capture is not set up. */
const ExtensionLine = () => {
  const { state } = useExtensionPresence();
  if (state !== EXTENSION_STATE.NOT_INSTALLED) return null;
  return (
    <p className="welcome__hint">
      Save from any page with the{' '}
      <a href={TOUR_EXTENSION_URL} target="_blank" rel="noopener noreferrer">browser extension</a>.
    </p>
  );
};

export default Welcome;
