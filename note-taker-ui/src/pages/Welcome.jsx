import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  adoptWikiStarterPack,
  archiveWikiPage,
  createWikiPage,
  getWikiPage,
  listWikiProposals,
  listWikiStarterPacks,
  startWikiPageBuild
} from '../api/wiki';
import { getArticles } from '../api/articles';
import {
  connectReadwiseToken,
  importExportFiles,
  importPastedText,
  importPastedUrl,
  syncReadwiseConnection
} from '../api/imports';
import { isOnboardingComplete, markOnboardingComplete } from '../onboarding/onboardingState';
import useExtensionPresence, { EXTENSION_STATE } from '../onboarding/useExtensionPresence';
import { TOUR_EXTENSION_URL } from '../tour/tourConfig';
import { wikiReadPath } from '../utils/wikiFeatureFlags';
import {
  EXAMPLE_PAGE,
  READWISE_TOKEN_URL,
  STEPS,
  buildFailure,
  linkLabel,
  packContents,
  pageLede,
  pageState,
  passageTitle,
  proposalSources,
  readPastedReading,
  readingList,
  readwiseReceipt,
  sourceTopics,
  tookPath,
  tookReceipt,
  topicProblem,
  writtenFrom
} from './welcomeModel';
import { Button, PageHeader } from '../components/ui';
import '../styles/welcome.css';

/**
 * First run: see what Noeis makes, bring your reading, get your first page.
 *
 * It ends on the page. Asking for a view here used to turn the new page into a
 * held view, which the Wiki home leaves out, so the one thing first run made
 * went missing from the Wiki the moment it was finished.
 *
 * The URL is the state (?step=…&page=…), so Back walks back through the steps,
 * a refresh resumes where you were (a build keeps going on the server), and
 * leaving for Readwise's token page in another tab costs nothing.
 */

const MAX_LINKS = 10;
const BUILD_POLL_MS = 4000;
const stepIndex = id => Math.max(0, STEPS.findIndex(step => step.id === id));
const messageFrom = (error, fallback) => error?.response?.data?.error || fallback;

/* The titles of what is in the library, newest first: named back while a page
   is written, and offered as topics when nothing recurs yet. */
const useLibraryTitles = () => {
  const [titles, setTitles] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getArticles({ limit: 6 })
      .then((articles) => {
        if (!cancelled) setTitles((Array.isArray(articles) ? articles : []).map(article => article?.title).filter(Boolean));
      })
      .catch(() => { if (!cancelled) setTitles([]); });
    return () => { cancelled = true; };
  }, []);
  return titles;
};

const Welcome = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const took = params.get('took') || '';
  const pageId = params.get('page') || took;
  const asked = params.get('step');
  const step = STEPS.some(item => item.id === asked) ? asked : (took ? 'page' : 'start');
  const [page, setPage] = useState(null);
  const [arrivals, setArrivals] = useState([]);
  const [brought, setBrought] = useState([]);

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
      return undefined;
    }
    if (page?._id === pageId) return undefined;
    let cancelled = false;
    getWikiPage(pageId)
      .then((loaded) => { if (!cancelled) setPage(loaded); })
      .catch(() => { if (!cancelled) go('page', { id: '', replace: true }); });
    return () => { cancelled = true; };
  }, [go, page?._id, pageId]);

  const current = stepIndex(step);
  const ready = !pageId || page?._id === pageId;

  return (
    <main className="welcome" aria-label="First run">
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
        {!ready ? <p className="welcome__quiet" role="status">Opening your page…</p> : null}

        {ready && step === 'start' ? (
          <StartStep
            onReading={() => go('reading', { id: '' })}
            onPack={(firstPage, library) => (firstPage ? navigate(tookPath(firstPage, library)) : finish('/wiki'))}
          />
        ) : null}

        {ready && step === 'reading' ? (
          <ReadingStep
            arrivals={arrivals}
            setArrivals={setArrivals}
            brought={brought}
            setBrought={setBrought}
            onNext={() => go('page', { id: '' })}
            onLater={() => finish('/library')}
          />
        ) : null}

        {ready && step === 'page' ? (
          <PageStep
            tookLine={took && tookReceipt({ sources: Number(params.get('sources')) || 0, had: Number(params.get('had')) || 0 })}
            page={page}
            setPage={setPage}
            onStarted={id => go('page', { id })}
            onAnother={() => go('page', { id: '' })}
            onReading={() => go('reading', { id: '' })}
            onOpen={() => finish(wikiReadPath(pageId))}
            onBooks={() => finish('/books')}
          />
        ) : null}
      </div>
    </main>
  );
};

/* ------------------------------------------------------------------ 1 */

const StartStep = ({ onReading, onPack }) => (
  <section className="welcome__step">
    <PageHeader
      titleId="welcome-title"
      title="Noeis writes a wiki from what you read."
      lede="Bring the articles and books you have read. Noeis writes them up into pages, and every line says which source it came from."
    />
    <article className="welcome__example" aria-label="An example page">
      <span className="welcome__example-label">An example page</span>
      <h2>{EXAMPLE_PAGE.title}</h2>
      <p>{EXAMPLE_PAGE.lede}</p>
      {EXAMPLE_PAGE.sections.map(([heading, body]) => (
        <section key={heading}>
          <h3>{heading}</h3>
          <p>{body}</p>
        </section>
      ))}
      <small>{EXAMPLE_PAGE.sources}</small>
    </article>
    <div className="welcome__actions">
      <Button variant="primary" onClick={onReading}>Start from my reading</Button>
    </div>
    <StarterWikis onTaken={onPack} />
  </section>
);

const ReadingStep = ({ arrivals, setArrivals, brought, setBrought, onNext, onLater }) => {
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
  const hasReading = libraryHasReading || arrived > 0 || brought.length > 0;
  const bring = receipt => setBrought(list => [...list, receipt]);

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
      <PageHeader titleId="welcome-title" title="Bring what you have read." lede="A few links are enough to start. Your library is private: nothing leaves it unless you share it." />

      <form className="welcome__source" onSubmit={addPasted}>
        <h2>Links</h2>
        <label className="sr-only" htmlFor="welcome-links">Links to things you have read</label>
        <textarea
          id="welcome-links"
          rows={3}
          value={pasted}
          placeholder="A few things you have read, one link per line. Or paste a few paragraphs of one."
          onChange={(event) => { setPasted(event.target.value); setPasteProblem(''); }}
        />
        <div className="welcome__actions">
          <Button type="submit" disabled={!pasted.trim()}>Add them</Button>
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

      <KindleSource onBrought={bring} />
      <ReadwiseSource onBrought={bring} />

      <div className="welcome__actions welcome__actions--end">
        <Button variant="primary" disabled={!hasReading || reading} onClick={onNext}>
          Write my first page
        </Button>
        <Button variant="quiet" onClick={onLater}>
          I will bring reading later
        </Button>
      </div>
      {!hasReading && !reading ? <p className="welcome__hint">Bring at least one source first.</p> : null}
    </section>
  );
};

/* Kindle keeps every highlight in one file on the device. */
const KindleSource = ({ onBrought }) => {
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');

  const bring = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await importExportFiles([file]);
      const landed = (result.importedArticleIds || []).length;
      setReceipt(result.summary || 'Your Kindle highlights are in your library.');
      if (landed) onBrought(result.summary);
    } catch (importError) {
      setError(messageFrom(importError, 'That file could not be read. Pick My Clippings.txt from the Kindle\'s documents folder.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="welcome__source">
      <h2>Kindle</h2>
      <p>Plug in your Kindle and pick <code>My Clippings.txt</code> from its documents folder. Every highlight comes in, filed under its book.</p>
      <div className="welcome__actions">
        <label className={`welcome__file-pick${busy ? ' is-busy' : ''}`}>
          <input type="file" accept=".txt,.html,.csv,.md" onChange={bring} disabled={busy} />
          {busy ? 'Reading the file…' : 'Choose the file'}
        </label>
      </div>
      {receipt ? <p className="welcome__receipt" role="status">{receipt}</p> : null}
      {error ? <p className="welcome__error" role="alert">{error}</p> : null}
    </div>
  );
};

const ReadwiseSource = ({ onBrought }) => {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');

  const bring = async (event) => {
    event.preventDefault();
    const apiToken = token.trim();
    if (!apiToken || busy) return;
    setBusy(true);
    setError('');
    try {
      const connection = await connectReadwiseToken({ apiToken });
      const result = await syncReadwiseConnection({ connectionId: connection?._id || connection?.id });
      setReceipt(readwiseReceipt(result));
      if ((result?.importedArticles || 0) > 0) onBrought(readwiseReceipt(result));
      setToken('');
    } catch (readwiseError) {
      setError(readwiseError?.response?.status === 400
        ? 'Readwise did not accept that token. Copy it again from readwise.io/access_token.'
        : messageFrom(readwiseError, 'Readwise could not be reached. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="welcome__source" onSubmit={bring}>
      <h2>Readwise</h2>
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
          onChange={(event) => { setToken(event.target.value); setError(''); }}
        />
        <Button type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Bringing them in…' : 'Bring them in'}
        </Button>
      </div>
      {busy ? <p className="welcome__hint" role="status">A large library takes a minute.</p> : null}
      {receipt ? <p className="welcome__receipt" role="status">{receipt}</p> : null}
      {error ? <p className="welcome__error" role="alert">{error}</p> : null}
    </form>
  );
};

/* Ready-made wikis to take. Every line cites a public source, and taking one
   brings those sources into the reader's Library. */
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
      onTaken(result?.pages?.[0]?._id || '', result?.library);
    } catch (_error) {
      setError('That wiki did not copy. Try again.');
      setBusyId('');
    }
  };

  return (
    <div className="welcome__packs">
      <h2>Or start from a ready-made wiki</h2>
      <p>Every line cites a public source, and the sources come into your Library with it.</p>
      <ul>
        {packs.map(pack => (
          <li key={pack.id}>
            <div>
              <strong>{pack.name}</strong>
              {pack.tagline ? <p>{pack.tagline}</p> : null}
              {packContents(pack) ? <small>{packContents(pack)}</small> : null}
            </div>
            <Button disabled={Boolean(busyId)} aria-label={`Take ${pack.name}`} onClick={() => take(pack)}>
              {busyId === pack.id ? 'Taking it…' : 'Take it'}
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="welcome__error" role="alert">{error}</p> : null}
    </div>
  );
};

/* ------------------------------------------------------------------ 2 */

const PageStep = ({ tookLine, page, setPage, onStarted, onAnother, onReading, onOpen, onBooks }) => {
  const state = pageState(page);
  const titles = useLibraryTitles();

  /* A build runs on the server. Read the page back until it lands. */
  useEffect(() => {
    if (state !== 'writing') return undefined;
    const timer = window.setTimeout(() => {
      getWikiPage(page._id).then(setPage).catch(() => {});
    }, BUILD_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [page, setPage, state]);

  if (state === 'none') return <TopicChooser titles={titles} onStarted={onStarted} />;

  if (state === 'writing') {
    return (
      <section className="welcome__step" aria-busy="true">
        <PageHeader
          titleId="welcome-title"
          className="welcome__reading"
          title={<>Writing {page.title}…</>}
          lede={`Noeis is reading ${readingList(titles)} and citing each source as it goes. A first page takes about a minute.`}
        />
        <div className="welcome__actions">
          <Button variant="quiet" onClick={onOpen}>
            Leave it to finish
          </Button>
        </div>
      </section>
    );
  }

  if (state === 'failed') return <BuildFailed page={page} setPage={setPage} onAnother={onAnother} onReading={onReading} />;

  return <WrittenPage tookLine={tookLine} page={page} onOpen={onOpen} onBooks={onBooks} />;
};

/* What the reading keeps coming back to, offered as titles. When nothing
   recurs yet, the titles of what was just brought stand in: a page about one
   source is still a page, and a blank box is a harder first question. */
const TopicChooser = ({ titles, onStarted }) => {
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

  const suggestions = proposals?.length
    ? proposals.map(proposal => ({ title: proposal.title, note: proposal.sourceRefs?.length ? proposalSources(proposal.sourceRefs.length) : '' }))
    : sourceTopics(titles || []).map(title => ({ title, note: 'from what you brought' }));

  return (
    <section className="welcome__step">
      <PageHeader titleId="welcome-title" title="What should your first page be about?" lede="Noeis writes it from what you brought, and cites each source." />

      {proposals === null ? (
        <p className="welcome__quiet welcome__reading" role="status">Looking at what your reading keeps coming back to…</p>
      ) : null}
      {proposals !== null && suggestions.length ? (
        <ul className="welcome__topics">
          {suggestions.map(suggestion => (
            <li key={suggestion.title}>
              <button type="button" disabled={Boolean(busy)} onClick={() => write(suggestion.title)}>
                {busy === suggestion.title ? `Starting ${suggestion.title}…` : suggestion.title}
              </button>
              {suggestion.note ? <small>{suggestion.note}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="welcome__source"
        onSubmit={(event) => { event.preventDefault(); write(topic); }}
      >
        <h2>{suggestions.length ? 'Or name a topic' : 'Name a topic'}</h2>
        <div className="welcome__inline">
          <label className="sr-only" htmlFor="welcome-topic">Topic for your first page</label>
          <input
            id="welcome-topic"
            type="text"
            value={topic}
            placeholder="Something your sources share, in a few words"
            onChange={(event) => { setTopic(event.target.value); setError(''); }}
          />
          <Button type="submit" variant="primary" disabled={Boolean(busy) || !topic.trim()}>
            {busy && busy === topic.trim() ? 'Starting…' : 'Write it'}
          </Button>
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
      <PageHeader titleId="welcome-title" title={failure.headline} lede={failure.lede} />
      <div className="welcome__actions">
        {failure.retry ? (
          <Button variant="primary" disabled={busy} onClick={retry}>Try again</Button>
        ) : null}
        <Button variant={failure.retry ? 'plain' : 'primary'} disabled={busy} onClick={() => discardThen(onAnother)}>
          Pick another topic
        </Button>
        <Button disabled={busy} onClick={() => discardThen(onReading)}>Bring more reading</Button>
      </div>
    </section>
  );
};

/* The page, and where to go from it. */
const WrittenPage = ({ tookLine, page, onOpen, onBooks }) => {
  const lede = pageLede(page);
  return (
    <section className="welcome__step">
      <p className="welcome__receipt" role="status">
        {tookLine || writtenFrom(page.sourceRefs?.length || 0)}
      </p>
      <PageHeader titleId="welcome-title" title={page.title} />
      {lede ? <p className="welcome__page-lede">{lede}</p> : null}
      <div className="welcome__actions">
        <Button variant="primary" onClick={onOpen}>Open your page</Button>
      </div>
      <div className="welcome__next">
        <h2>When you are reading a book</h2>
        <p>Name it in Books and type as you read: a page number, a quote, a question. It all lands on the book&apos;s page.</p>
        <div className="welcome__actions">
          <Button onClick={onBooks}>Name the book you are reading</Button>
        </div>
        <ExtensionLine />
      </div>
    </section>
  );
};

/* One line, and only while it is true that capture is not set up. */
const ExtensionLine = () => {
  const { state } = useExtensionPresence();
  if (state !== EXTENSION_STATE.NOT_INSTALLED) return null;
  return (
    <p className="welcome__hint">
      On the web, save any page with the{' '}
      <a href={TOUR_EXTENSION_URL} target="_blank" rel="noopener noreferrer">browser extension</a>.
    </p>
  );
};

export default Welcome;
