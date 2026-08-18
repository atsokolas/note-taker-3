import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  adoptWikiStarterPack,
  deleteWikiPage,
  listWikiStarterPacks
} from '../api/wiki';
import { importPastedText, importPastedUrl } from '../api/imports';
import { getArticles } from '../api/articles';
import { markWikiOnboardingComplete } from '../onboarding/onboardingState';
import ExtensionCaptureCard from '../onboarding/ExtensionCaptureCard';
import { startWalkthrough } from '../onboarding/walkthroughState';
import '../styles/wiki-front-page.css';
import '../styles/wiki-onboarding-column.css';



// Only what the Connections page can actually deep-link to. Naming a provider we
// cannot open would put us back where we started: a name that looks clickable and
// is not.
const READING_PROVIDERS = [
  { key: 'readwise', label: 'Readwise' },
  { key: 'notion', label: 'Notion' },
  { key: 'evernote', label: 'Evernote' }
];

const PROVIDER_LABELS = READING_PROVIDERS.reduce((labels, provider) => (
  { ...labels, [provider.key]: provider.label }
), {});

const CONNECT_ATTEMPT_KEY = 'noeis.onboarding.connectAttempt';

const rememberConnectAttempt = (provider) => {
  try {
    window.sessionStorage?.setItem(CONNECT_ATTEMPT_KEY, String(provider || ''));
  } catch (_error) {
    // The return receipt is a nicety; losing it must not block connecting.
  }
};

const readConnectAttempt = () => {
  try {
    return window.sessionStorage?.getItem(CONNECT_ATTEMPT_KEY) || '';
  } catch (_error) {
    return '';
  }
};

const clearConnectAttempt = () => {
  try {
    window.sessionStorage?.removeItem(CONNECT_ATTEMPT_KEY);
  } catch (_error) {
    // Nothing to clean up.
  }
};

const starterFallback = [
  {
    id: 'mental-models',
    name: 'Mental Models',
    tagline: 'The Munger latticework for better judgment.',
    description: 'Core models for tradeoffs, safety, incentives, and compounding.',
    pageCount: 7,
    hero: true
  }
];

const titleCaseConcept = (value = '') => {
  const words = String(value || '')
    .replace(/[“”"]/g, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && index < words.length - 1 && ['and', 'or', 'of', 'the', 'a', 'an', 'to', 'in', 'for'].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

const inferConceptTitleFromText = (value = '') => {
  const firstLine = String(value || '')
    .replace(/^https?:\/\/\S+/i, '')
    .split(/\n+/)
    .map(line => line.trim())
    .find(Boolean) || '';
  const cleaned = firstLine
    .replace(/^[#>\-\s*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'My First Source';
  const definitionMatch = cleaned.match(/^(.{3,80}?)\s+(?:is|are|refers to|means|describes)\b/i);
  const phrase = (definitionMatch?.[1] || cleaned.split(/[.:;!?—–-]/)[0] || cleaned)
    .replace(/\b(?:this|that|these|those)\b/gi, '')
    .trim();
  return titleCaseConcept(phrase) || 'My First Source';
};

/**
 * The evidence gate refuses claims that have no lexical anchor in their sources —
 * correctly, since that is the difference between synthesis and invention. But a
 * single sentence gives it nothing to anchor to, so any article worth reading would
 * have to invent, and every build from one is rejected after two rebuild attempts.
 *
 * Observed in production: a one-sentence paste spent ~20s and produced nothing, with
 * mechanism, example and boundary coverage all false.
 *
 * A URL is always allowed: the fetched article supplies the body. Pasted prose needs
 * enough substance to say something grounded.
 */
const MIN_PASTED_WORDS = 40;

const wordCount = (value = '') => String(value || '').trim().split(/\s+/).filter(Boolean).length;

export const describeThinSource = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return 'Paste a link or a few paragraphs first.';
  if (/^https?:\/\/\S+/i.test(text)) return '';
  if (wordCount(text) < MIN_PASTED_WORDS) {
    return 'That is too short to build from without inventing things I cannot source. Paste the link instead, or a few paragraphs.';
  }
  return '';
};

const firstUrlFromText = (value = '') => {
  const match = String(value || '').trim().match(/^https?:\/\/\S+/i);
  return match ? match[0] : '';
};


const ReturnLoopCard = ({ adopted = false } = {}) => (
  <section className="wiki-onboarding__return-loop" aria-label="Tomorrow's Morning Paper">
    <div>
      <span className="wiki-onboarding__return-kicker">Tomorrow's Morning Paper</span>
      <h2>Noeis will look for pages it can grow while you are away.</h2>
      <p>
        Background maintenance checks due wiki pages about every six hours. Connect a reading source and tomorrow's front page can show what changed, what needs review, and where your graph got stronger.
      </p>
    </div>
    <ul>
      <li>Scheduled page refresh is on.</li>
      <li>{adopted ? 'Your adopted copy joins your own maintenance loop.' : 'Pages you build join the maintenance loop.'}</li>
      <li>Readwise or Notion adds fresh material when connected.</li>
    </ul>
  </section>
);

const WikiOnboarding = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const adoptedPageId = params.get('adoptedPage') || '';
  const source = params.get('source') || '';
  const [step, setStep] = useState(adoptedPageId ? 'hook' : 'show');
  const [packs, setPacks] = useState(starterFallback);
  const [selectedPackId, setSelectedPackId] = useState('mental-models');
  const [pasteText, setPasteText] = useState('');
  const [importedSource, setImportedSource] = useState(null);
  const [connectedReceipt, setConnectedReceipt] = useState(null);
  const [adoptedStarterPages, setAdoptedStarterPages] = useState([]);
  const [adoptedPack, setAdoptedPack] = useState(null);
  const [mergeAvailable, setMergeAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listWikiStarterPacks()
      .then((items) => {
        if (!cancelled && Array.isArray(items) && items.length) {
          setPacks(items);
          setSelectedPackId(items.find(pack => pack.hero)?.id || items[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setPacks(starterFallback);
      });
    return () => { cancelled = true; };
  }, []);

  /**
   * Coming back from a connector.
   *
   * Connecting an archive leaves the app: OAuth goes to the provider and returns to
   * Connections, and the first-run gate then sends the user here again because they
   * still have no wiki pages. Without this they would land back on the opening
   * screen as though nothing had happened, and be asked to start over.
   *
   * If they left to connect something and now have sources, first run is done —
   * say what arrived and let them go to it.
   */
  useEffect(() => {
    const attempted = readConnectAttempt();
    if (!attempted) return undefined;
    let cancelled = false;
    getArticles({ limit: 50 })
      .then((articles) => {
        if (cancelled) return;
        const count = Array.isArray(articles) ? articles.length : 0;
        if (!count) return;
        clearConnectAttempt();
        setConnectedReceipt({ provider: attempted, count });
        markWikiOnboardingComplete();
        setStep('hook');
      })
      .catch(() => {
        // If we cannot tell, leave them where they are rather than claiming an
        // import that may not have happened.
      });
    return () => { cancelled = true; };
  }, []);

  const selectedPack = useMemo(
    () => packs.find(pack => pack.id === selectedPackId) || packs[0] || starterFallback[0],
    [packs, selectedPackId]
  );

  const markComplete = markWikiOnboardingComplete;

  /**
   * First run does not build a wiki page.
   *
   * A wiki page is synthesis over accumulated reading. One pasted link is not
   * accumulated reading, so the evidence gate refuses it — correctly, and roughly
   * half the time in production. Building here meant a ~20 second wait, a headline
   * claiming a page existed before it did, and a coin-flip chance that a new user's
   * first outcome was a failure.
   *
   * The source itself is real the moment it is imported. That is what first run
   * delivers, and the wiki is something the user builds later, deliberately, when
   * they have material worth building from.
   */

  const adoptStarterPack = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await adoptWikiStarterPack(selectedPack.id);
      const pages = Array.isArray(result.pages) ? result.pages : [];
      setAdoptedStarterPages(pages);
      setAdoptedPack(result.pack || selectedPack);
      setMergeAvailable(Boolean(result.mergeAvailable));
      // Adopted pages arrive already written; there is nothing to build. The copy
      // starts diverging from the original the first time the user's own material
      // reaches it, not from a refresh run during onboarding.
      markComplete();
      setStep('hook');
    } catch (err) {
      setError(err?.message || 'Could not add that starter pack.');
      setStep('feed');
    } finally {
      setBusy(false);
    }
  };

  const addToLibrary = async () => {
    const text = pasteText.trim();
    // Refuse before spending the user's time, not after. A build from a source this
    // thin takes ~20s and cannot pass the evidence gate.
    const thin = describeThinSource(text);
    if (thin) {
      setError(thin);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const droppedUrl = firstUrlFromText(text);
      const suggestedTitle = inferConceptTitleFromText(text);
      const imported = droppedUrl
        ? await importPastedUrl({ url: droppedUrl })
        : await importPastedText({ text, title: suggestedTitle });
      const article = imported?.article || {};
      setImportedSource({
        title: article.title || suggestedTitle,
        url: article.url || droppedUrl || ''
      });
      markComplete();
      setStep('hook');
    } catch (err) {
      setError(err?.message || 'Could not read that. Try the link, or paste the text itself.');
      setStep('feed');
    } finally {
      setBusy(false);
    }
  };

  const clearSamplePack = async () => {
    const pages = adoptedStarterPages
      .map(page => page?._id || page?.id)
      .filter(Boolean);
    if (!pages.length) {
      setStep('feed');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await Promise.all(pages.map(pageId => deleteWikiPage(pageId)));
      setAdoptedStarterPages([]);
      setAdoptedPack(null);
      setMergeAvailable(false);
      setStep('feed');
    } catch (err) {
      setError(err?.message || 'Could not clear the sample pack.');
    } finally {
      setBusy(false);
    }
  };

  // Every path out of onboarding lands in the Library, on the material that just
  // arrived. It is the one place that is truthfully populated at the end of first
  // run, and it is where the next thing the user does begins.
  // A copied wiki arrives with pages; an imported source does not. The ending has to
  // say which of those actually happened.
  const arrivedWithPages = source === 'shared' || adoptedStarterPages.length > 0;

  const goToLibrary = () => {
    markComplete();
    navigate('/library', { replace: true });
  };

  const showMeAround = () => {
    markComplete();
    startWalkthrough();
  };

  return (
    <main className="wiki-onboarding" aria-live="polite">
      {step === 'show' ? (
        <section className="wiki-onboarding__panel wiki-onboarding__panel--show">
          <p className="wiki-onboarding__eyebrow">Noeis wiki</p>
          <h1>This is what Noeis builds from your reading.</h1>
          <p>Let’s make yours: one page first, then the graph starts forming around it.</p>
          <div className="wiki-onboarding__example">
            <span>Loss Aversion</span>
            <p>People often feel losses more sharply than equivalent gains, and that pressure changes decisions.</p>
            <div className="wiki-onboarding__example-page" aria-label="Example wiki page preview">
              <section>
                <h2>Core idea</h2>
                <p>Loss aversion explains why a small downside can dominate a larger upside when a decision feels personal or irreversible.</p>
              </section>
              <section>
                <h2>Evidence</h2>
                <p>When paired with Opportunity Cost, it exposes the hidden price of avoiding a visible loss: the foregone alternative may compound quietly.</p>
              </section>
              <section>
                <h2>Open question</h2>
                <p>Where is caution protecting the downside, and where is it disguising an unchosen better path?</p>
              </section>
              <small>[1] behavioral decision research · [2] saved investing notes</small>
            </div>
          </div>
          <button type="button" onClick={() => setStep('feed')}>Start</button>
        </section>
      ) : null}

      {step === 'feed' ? (
        <section className="wiki-onboarding__panel wiki-onboarding__panel--feed">
          <div>
            <p className="wiki-onboarding__eyebrow">Feed the wiki</p>
            <h1>Start with what you have already read.</h1>
            <p>
              Noeis is built on your own archive. Connect it and everything you have
              been saving becomes material you can work from.
            </p>
          </div>

          {/* Import leads.
              It used to be a link under a button, below four sample packs — so
              the first thing a new reader was offered was somebody else's
              material, and their own years of reading were an afterthought.
              A wiki built from a starter pack is a demo; a wiki built from your
              archive is yours on the first page. */}
          {/* The provider names are the affordance. They used to be prose under a
              single link to the whole settings page, so the one thing a reader with
              an archive would reach for could not be clicked, and the link that
              could dropped them on a page of every connector at once. Each name now
              opens its own connector; the page already supports ?source= and an
              anchor per card. */}
          <div className="wiki-onboarding__archive">
            <p className="wiki-onboarding__archive-lead">Connect your reading archive</p>
            <ul className="wiki-onboarding__providers">
              {READING_PROVIDERS.map(provider => (
                <li key={provider.key}>
                  <Link
                    className="wiki-onboarding__provider"
                    to={`/connections?source=${provider.key}#${provider.key}`}
                    onClick={() => rememberConnectAttempt(provider.key)}
                  >
                    {provider.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p>Whatever you have been saving into. Come back here when it is connected.</p>
          </div>

          <label className="wiki-onboarding__paste">
            <span>Or paste a link, or a few paragraphs</span>
            <textarea
              value={pasteText}
              onChange={event => setPasteText(event.target.value)}
              placeholder="Paste a link to something you read this week - or a few paragraphs of it..."
            />
          </label>
          <button type="button" onClick={addToLibrary} disabled={busy}>Add to my library</button>

          <p className="wiki-onboarding__packs-lead">
            Nothing to connect yet? Start from a pack and replace it as your own reading arrives.
          </p>
          <div className="wiki-onboarding__packs" role="list">
            {packs.map(pack => (
              <button
                key={pack.id}
                type="button"
                className={`wiki-onboarding__pack ${pack.id === selectedPackId ? 'is-selected' : ''}`}
                onClick={() => setSelectedPackId(pack.id)}
              >
                <span>{pack.hero ? 'Recommended' : `${pack.pageCount || 0} pages`}</span>
                <strong>{pack.name}</strong>
                <p>{pack.tagline || pack.description}</p>
              </button>
            ))}
          </div>
          <div className="wiki-onboarding__feed-actions">
            <button type="button" onClick={adoptStarterPack} disabled={busy}>
              {busy ? 'Preparing...' : 'Add selected pack'}
            </button>
          </div>
          {error ? <p className="wiki-onboarding__error" role="alert">{error}</p> : null}
        </section>
      ) : null}

      {step === 'hook' ? (
        <section className="wiki-onboarding__panel wiki-onboarding__panel--hook">
          <p className="wiki-onboarding__eyebrow">{arrivedWithPages ? 'Adopted wiki' : 'In your library'}</p>
          {/* No page was built, so nothing here claims one was.
              This used to read "Your first page is ready" while a build was still
              running — false when shown, and still false two minutes later. What is
              true at this moment is that the material arrived. */}
          <h1>
            {arrivedWithPages
              ? 'This wiki is now yours.'
              : connectedReceipt
                ? 'Your reading is in.'
                : 'That is in your library now.'}
          </h1>
          <p>
            {arrivedWithPages
              ? 'The pages were copied into your workspace. Your copy grows as you feed it, and the original owner keeps theirs.'
              : 'Kept whole, with its source attached. Add a few more and the wiki has something real to be built from — when you decide to build it.'}
          </p>
          {connectedReceipt ? (
            <p className="wiki-onboarding__arrival">
              {`${PROVIDER_LABELS[connectedReceipt.provider] || 'Your archive'} connected — ${connectedReceipt.count} ${connectedReceipt.count === 1 ? 'source' : 'sources'} in your library.`}
            </p>
          ) : null}
          {importedSource?.title ? (
            <p className="wiki-onboarding__arrival">{importedSource.title}</p>
          ) : null}

          <div className="wiki-onboarding__hook-actions">
            <button type="button" onClick={goToLibrary}>Go to my library</button>
            <button type="button" className="wiki-onboarding__secondary-action" onClick={showMeAround}>
              Show me around first
            </button>
            {/* Only when there is something to look at. A copied wiki has pages;
                a first imported source does not. */}
            {arrivedWithPages ? <Link to="/wiki">See the copied pages</Link> : null}
          </div>

          <ExtensionCaptureCard compact heading="Save from anywhere" />

          {adoptedStarterPages.some(page => page?.adoptedFrom?.sample) ? (
            <section className="wiki-onboarding__sample" aria-label="Starter pack controls">
              <div>
                <strong>{adoptedPack?.name || 'Starter pack'} is sample material.</strong>
                <p>Feed Noeis your reading to make these pages yours. You can clear the sample pack any time.</p>
              </div>
              <div className="wiki-onboarding__sample-actions">
                {mergeAvailable ? <Link to="/wiki/workspace?view=list">Review possible merges</Link> : null}
                <button type="button" onClick={clearSamplePack} disabled={busy}>
                  {busy ? 'Clearing...' : 'Clear sample pack'}
                </button>
              </div>
            </section>
          ) : null}
          {error ? <p className="wiki-onboarding__error" role="alert">{error}</p> : null}
          <ReturnLoopCard adopted={source === 'shared'} />
        </section>
      ) : null}
    </main>
  );
};

export default WikiOnboarding;
