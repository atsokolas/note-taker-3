import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  adoptWikiStarterPack,
  archiveWikiPage,
  createWikiPage,
  getJudgmentLibraryEvidence,
  getWikiPage,
  listWikiProposals,
  listWikiStarterPacks,
  startWikiPageBuild,
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
import { wikiReadPath } from '../utils/wikiFeatureFlags';
import { fileEvidenceIntoJudgment, oneSentence, sourceHrefFromOrigin } from './judgmentModel';
import {
  FILED_LINE,
  READWISE_TOKEN_URL,
  STEPS,
  buildFailure,
  extraSentenceNotice,
  linkLabel,
  markMatches,
  pageLede,
  pageState,
  passageTitle,
  passagesHeadline,
  proposalSources,
  readPastedReading,
  readwiseReceipt,
  savedOn,
  topicProblem,
  viewProblem,
  writtenFrom
} from './welcomeModel';
import '../styles/welcome.css';

/**
 * First run: bring your reading, get your first wiki page, then say what you
 * think about it.
 *
 * The homepage promises a knowledge base grown from what you read, so that is
 * what the first minutes deliver: the reader's own sources, written up into a
 * page that cites them. Only once there is something on the page do we ask
 * what they think, and then the view is read against the very reading that
 * made the page, so the judgment moment is never empty.
 *
 * The URL is the state (?step=…&page=…), so Back walks back through the steps,
 * a refresh resumes where you were (a build keeps going on the server), and
 * leaving for Readwise's token page in another tab costs nothing.
 */

const MAX_LINKS = 10;
const BUILD_POLL_MS = 4000;
const stepIndex = id => Math.max(0, STEPS.findIndex(step => step.id === id));
const messageFrom = (error, fallback) => error?.response?.data?.error || fallback;

const Welcome = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const took = params.get('took') || '';
  const pageId = params.get('page') || took;
  const asked = params.get('step');
  const step = STEPS.some(item => item.id === asked) ? asked : (took ? 'page' : 'reading');
  const [page, setPage] = useState(null);
  const [arrivals, setArrivals] = useState([]);
  const [readwise, setReadwise] = useState(null);

  const go = useCallback((nextStep, { id = pageId, replace = false } = {}) => {
    const next = new URLSearchParams();
    next.set('step', nextStep);
    if (id && id !== took) next.set('page', id);
    if (took) next.set('took', took);
    setParams(next, { replace });
    window.scrollTo?.(0, 0);
  }, [pageId, setParams, took]);

  const finish = useCallback((destination) => {
    markOnboardingComplete();
    navigate(destination, { replace: true });
  }, [navigate]);

  /* A reader past first run who took a shared wiki goes to what they took. */
  useEffect(() => {
    if (took && isOnboardingComplete()) navigate(wikiReadPath(took), { replace: true });
  }, [navigate, took]);

  /* The page in the URL, read back. */
  useEffect(() => {
    if (!pageId) {
      setPage(null);
      if (step === 'moment') go('page', { id: '', replace: true });
      return undefined;
    }
    if (page?._id === pageId) return undefined;
    let cancelled = false;
    getWikiPage(pageId)
      .then((loaded) => { if (!cancelled) setPage(loaded); })
      .catch(() => { if (!cancelled) go('page', { id: '', replace: true }); });
    return () => { cancelled = true; };
  }, [go, page?._id, pageId, step]);

  const current = stepIndex(step);
  const ready = !pageId || page?._id === pageId;
  const held = page?.judgment?.currentJudgment || '';

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
          onClick={() => finish(pageId ? wikiReadPath(pageId) : '/library')}
        >
          Skip for now
        </button>
      </header>

      <div className="welcome__column" key={step}>
        {step === 'moment' && held ? (
          <p className="welcome__held">
            <span>On {page.title}, you hold</span>
            {held}
          </p>
        ) : null}

        {!ready ? <p className="welcome__quiet" role="status">Opening your page…</p> : null}

        {ready && step === 'reading' ? (
          <ReadingStep
            arrivals={arrivals}
            setArrivals={setArrivals}
            readwise={readwise}
            setReadwise={setReadwise}
            onNext={() => go('page', { id: '' })}
            onPack={firstPage => finish(firstPage ? wikiReadPath(firstPage) : '/wiki')}
            onLater={() => finish('/library')}
          />
        ) : null}

        {ready && step === 'page' ? (
          <PageStep
            took={took}
            page={page}
            setPage={setPage}
            onStarted={id => go('page', { id })}
            onAnother={() => go('page', { id: '' })}
            onReading={() => go('reading', { id: '' })}
            onHeld={() => go('moment')}
            onOpen={() => finish(wikiReadPath(pageId))}
          />
        ) : null}

        {ready && step === 'moment' && page ? (
          <MomentStep
            page={page}
            setPage={setPage}
            onReading={() => go('reading', { id: '' })}
            onFinish={() => finish(`/judgment/${page._id}`)}
          />
        ) : null}
      </div>
    </main>
  );
};

/* ------------------------------------------------------------------ 1 */

const ReadingStep = ({ arrivals, setArrivals, readwise, setReadwise, onNext, onPack, onLater }) => {
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
        Noeis grows your wiki from it: pages written from your own sources, each one citing where
        it came from. Your library is yours alone.
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
          Write my first page
        </button>
        <button type="button" className="welcome__quiet-action" onClick={onLater}>
          I will bring reading later
        </button>
      </div>
      {!hasReading && !reading ? <p className="welcome__hint">Bring at least one source first.</p> : null}
      {!hasReading && !reading ? <StarterWikis onTaken={onPack} /> : null}
    </section>
  );
};

/* For a reader with nothing to bring yet. Starter wikis are sample pages with
   no sources behind them, and this says so rather than dressing them up. */
const StarterWikis = ({ onTaken }) => {
  const [packs, setPacks] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listWikiStarterPacks()
      .then((list) => { if (!cancelled) setPacks(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!packs.length) return null;

  const take = async (pack) => {
    if (busyId) return;
    setBusyId(pack.id);
    setError('');
    try {
      const result = await adoptWikiStarterPack(pack.id);
      onTaken(result?.pages?.[0]?._id || '');
    } catch (_error) {
      setError('That wiki did not copy. Try again.');
      setBusyId('');
    }
  };

  return (
    <div className="welcome__examples">
      <p>Nothing to bring yet? Start from a sample wiki. Its pages grow once your own reading arrives.</p>
      <ul>
        {packs.map(pack => (
          <li key={pack.id}>
            <button type="button" disabled={Boolean(busyId)} onClick={() => take(pack)}>
              {busyId === pack.id ? `Copying ${pack.name}…` : pack.name}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="welcome__error" role="alert">{error}</p> : null}
    </div>
  );
};

/* ------------------------------------------------------------------ 2 */

const PageStep = ({ took, page, setPage, onStarted, onAnother, onReading, onHeld, onOpen }) => {
  const state = pageState(page);

  /* A build runs on the server. Read the page back until it lands. */
  useEffect(() => {
    if (state !== 'writing') return undefined;
    const timer = window.setTimeout(() => {
      getWikiPage(page._id).then(setPage).catch(() => {});
    }, BUILD_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [page, setPage, state]);

  if (state === 'none') return <TopicChooser onStarted={onStarted} />;

  if (state === 'writing') {
    return (
      <section className="welcome__step" aria-busy="true">
        <h1 id="welcome-title" className="welcome__reading">Writing {page.title}…</h1>
        <p className="welcome__lede">
          Noeis is reading your library for it and writing the page, citing each source as it goes.
          A first page takes a minute or two.
        </p>
        <div className="welcome__actions">
          <button type="button" className="welcome__quiet-action" onClick={onOpen}>
            Leave it to finish
          </button>
        </div>
      </section>
    );
  }

  if (state === 'failed') return <BuildFailed page={page} setPage={setPage} onAnother={onAnother} onReading={onReading} />;

  return <WrittenPage took={took} page={page} setPage={setPage} onHeld={onHeld} onOpen={onOpen} />;
};

/* What the reading keeps coming back to, offered as titles. When nothing
   recurs yet the list is simply absent; the reader names a topic. */
const TopicChooser = ({ onStarted }) => {
  const [proposals, setProposals] = useState(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listWikiProposals()
      .then(({ proposals: found }) => { if (!cancelled) setProposals(found.slice(0, 4)); })
      .catch(() => { if (!cancelled) setProposals([]); });
    return () => { cancelled = true; };
  }, []);

  const write = async (title) => {
    const problem = topicProblem(title);
    if (problem) {
      setError(problem);
      return;
    }
    if (busy) return;
    setBusy(title.trim());
    setError('');
    try {
      const created = await createWikiPage({ title: title.trim(), pageType: 'topic' });
      await startWikiPageBuild(created._id);
      onStarted(created._id);
    } catch (writeError) {
      setError(messageFrom(writeError, 'That page could not be started. Try once more.'));
      setBusy('');
    }
  };

  return (
    <section className="welcome__step">
      <h1 id="welcome-title">What should your first page be about?</h1>
      <p className="welcome__lede">Noeis writes it from what you brought, and cites each source.</p>

      {proposals === null ? (
        <p className="welcome__quiet welcome__reading" role="status">Looking at what your reading keeps coming back to…</p>
      ) : null}
      {proposals?.length ? (
        <ul className="welcome__topics">
          {proposals.map(proposal => (
            <li key={proposal._id}>
              <button type="button" disabled={Boolean(busy)} onClick={() => write(proposal.title)}>
                {busy === proposal.title ? `Starting ${proposal.title}…` : proposal.title}
              </button>
              {proposal.sourceRefs?.length ? <small>{proposalSources(proposal.sourceRefs.length)}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="welcome__source"
        onSubmit={(event) => { event.preventDefault(); write(topic); }}
      >
        <h2>{proposals?.length ? 'Or name a topic' : 'Name a topic'}</h2>
        <div className="welcome__inline">
          <label className="sr-only" htmlFor="welcome-topic">Topic for your first page</label>
          <input
            id="welcome-topic"
            type="text"
            value={topic}
            placeholder="Something your sources share, in a few words"
            onChange={(event) => { setTopic(event.target.value); setError(''); }}
          />
          <button type="submit" className="welcome__primary" disabled={Boolean(busy) || !topic.trim()}>
            {busy && busy === topic.trim() ? 'Starting…' : 'Write it'}
          </button>
        </div>
      </form>
      {error ? <p className="welcome__error" role="alert">{error}</p> : null}
    </section>
  );
};

const BuildFailed = ({ page, setPage, onAnother, onReading }) => {
  const [busy, setBusy] = useState(false);
  const failure = buildFailure(page);

  /* A page that was never written is not left behind in the reader's wiki. */
  const discardThen = async (next) => {
    setBusy(true);
    await archiveWikiPage(page._id).catch(() => {});
    next();
  };

  const retry = async () => {
    setBusy(true);
    try {
      await startWikiPageBuild(page._id);
      setPage({ ...page, aiState: { ...page.aiState, draftStatus: 'maintaining' } });
    } catch (_error) {
      setBusy(false);
    }
  };

  return (
    <section className="welcome__step">
      <h1 id="welcome-title">{failure.headline}</h1>
      <p className="welcome__lede">{failure.lede}</p>
      <div className="welcome__actions">
        {failure.retry ? (
          <button type="button" className="welcome__primary" disabled={busy} onClick={retry}>Try again</button>
        ) : null}
        <button type="button" className={failure.retry ? '' : 'welcome__primary'} disabled={busy} onClick={() => discardThen(onAnother)}>
          Pick another topic
        </button>
        <button type="button" disabled={busy} onClick={() => discardThen(onReading)}>Bring more reading</button>
      </div>
    </section>
  );
};

/* The page, then the one question that turns it into a view. */
const WrittenPage = ({ took, page, setPage, onHeld, onOpen }) => {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef(null);
  const lede = pageLede(page);
  const notice = extraSentenceNotice(draft);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [draft]);

  const hold = async (event) => {
    event?.preventDefault?.();
    const sentence = oneSentence(draft);
    if (busy || !sentence) return;
    const problem = viewProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await updateWikiPage(page._id, {
        judgment: { currentJudgment: sentence, startedAt: new Date().toISOString() }
      });
      setPage(saved?._id ? saved : { ...page, judgment: { currentJudgment: sentence } });
      onHeld();
    } catch (holdError) {
      setError(messageFrom(holdError, 'That did not save. Try once more.'));
      setBusy(false);
    }
  };

  return (
    <section className="welcome__step">
      <p className="welcome__receipt" role="status">
        {took ? 'The wiki you took is in your Wiki now.' : writtenFrom(page.sourceRefs?.length || 0)}
      </p>
      <h1 id="welcome-title">{page.title}</h1>
      {lede ? <p className="welcome__page-lede">{lede}</p> : null}
      <div className="welcome__actions">
        <button type="button" onClick={onOpen}>Read the whole page</button>
      </div>

      <form className="welcome__source" onSubmit={hold}>
        <h2>What do you think about it?</h2>
        <p>One sentence you could be wrong about. Noeis reads what you saved against it.</p>
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
          <button type="button" className="welcome__quiet-action" onClick={onOpen}>Not yet</button>
        </div>
      </form>
    </section>
  );
};

/* ------------------------------------------------------------------ 3 */

const MomentStep = ({ page, setPage, onReading, onFinish }) => {
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
    getJudgmentLibraryEvidence(page._id, { limit: 8 })
      .then((found) => { if (!cancelled) setCandidates(found.candidates); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt, page._id]);

  const file = async (candidate, field) => {
    if (busyId) return;
    setFileError('');
    if (field === 'skip') {
      setFiled(current => ({ ...current, [candidate.id]: 'skip' }));
      return;
    }
    setBusyId(candidate.id);
    try {
      const judgment = fileEvidenceIntoJudgment(page, candidate, field);
      const saved = await updateWikiPage(page._id, { judgment });
      const before = (page?.judgment?.[field] || []).length;
      if ((saved?.judgment?.[field] || []).length <= before) throw new Error('not saved');
      setPage(saved);
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
          that argues about it, and Noeis looks again each time you open your view.
        </p>
        <div className="welcome__actions">
          <button type="button" className="welcome__primary" onClick={onReading}>Bring one more source</button>
          <button type="button" className="welcome__quiet-action" onClick={onFinish}>Open your view</button>
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
