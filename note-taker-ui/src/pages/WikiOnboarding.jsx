import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  adoptWikiStarterPack,
  createWikiPage,
  deleteWikiPage,
  listWikiStarterPacks,
  startWikiPageBuild,
  updateWikiPage
} from '../api/wiki';
import { importPastedText, importPastedUrl } from '../api/imports';
import { createJudgment } from './judgmentModel';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import { markWikiOnboardingComplete } from '../onboarding/onboardingState';
import { setActiveBuild } from '../onboarding/activeBuild';
import ExtensionCaptureCard from '../onboarding/ExtensionCaptureCard';
import { startWalkthrough } from '../onboarding/walkthroughState';
import '../styles/wiki-front-page.css';
import '../styles/wiki-onboarding-column.css';

const FAST_BUILD_OPTIONS = {
  maintenanceProfile: 'fast',
  sourceLimit: 8,
  // No sourceTextLimit. The server now budgets source text by how many sources a
  // page has, and a first page has exactly one — the article the user just pasted,
  // which is the whole point of the page. Naming a number here could only ask for
  // less than that budget, which is what starved the first build in the first place.
  inlineAutolinkLimit: 150,
  // The quality rebuild is what repairs a first draft that misses the bar. It was
  // skipped because the user was staring at a spinner; they are not any more —
  // the build runs detached — so the seconds it costs buy a page instead of an
  // apology.
  skipQualityRebuild: false,
  // Render [hf-timing] logs (2026-06-21): the streamed draft took ~31s
  // (totalMs=30796) while the SAME groq+gpt-oss-120b call in blocking mode
  // finished in 2-5s. The HF router trickles tokens for this model, so
  // streaming costs ~26s for zero functional gain.
  streamDraft: false,
  deferInboundAutolinks: true
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
      <li>{adopted ? 'Your adopted copy joins your own maintenance loop.' : 'Your first page joins the maintenance loop.'}</li>
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
  const [claimDraft, setClaimDraft] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('mental-models');
  const [pasteText, setPasteText] = useState('');
  const [builtPageId, setBuiltPageId] = useState(adoptedPageId);
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

  const selectedPack = useMemo(
    () => packs.find(pack => pack.id === selectedPackId) || packs[0] || starterFallback[0],
    [packs, selectedPackId]
  );

  const markComplete = markWikiOnboardingComplete;

  /**
   * Start the build and hand the user forward.
   *
   * A real maintenance pass takes far longer than a new user will sit and watch, so
   * nothing here waits for it. The server accepts the build, the banner picks it up
   * from anywhere in the app, and the user carries on.
   */
  const startBuild = async ({ pageId, title = '' }) => {
    setBuiltPageId(pageId);
    const accepted = await startWikiPageBuild(pageId, FAST_BUILD_OPTIONS);
    setActiveBuild({
      pageId,
      title,
      startedAt: accepted?.startedAt || null
    });
    markComplete();
    setStep('hook');
  };

  const adoptStarterPack = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await adoptWikiStarterPack(selectedPack.id);
      const pages = Array.isArray(result.pages) ? result.pages : [];
      setAdoptedStarterPages(pages);
      setAdoptedPack(result.pack || selectedPack);
      setMergeAvailable(Boolean(result.mergeAvailable));
      const firstPage = pages[0] || {};
      setBuiltPageId(firstPage._id || firstPage.id || '');
      if (firstPage?._id || firstPage?.id) {
        // Refresh the first adopted page against this workspace in the background —
        // that refresh is what makes the copy diverge from the original.
        await startBuild({
          pageId: firstPage._id || firstPage.id,
          title: firstPage.title || selectedPack.name
        });
      } else {
        markComplete();
        setStep('hook');
      }
    } catch (err) {
      setError(err?.message || 'Could not add that starter pack.');
      setStep('feed');
    } finally {
      setBusy(false);
    }
  };

  const buildFromPaste = async () => {
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
      const title = article.title || suggestedTitle;
      const page = await createWikiPage({
        title,
        pageType: 'overview',
        sourceScope: 'selected_sources',
        createdFrom: {
          type: 'article',
          objectId: article._id || article.id || '',
          text: droppedUrl || text,
          label: article.title || 'Pasted source'
        },
        initialSourceRef: {
          type: 'article',
          objectId: article._id || article.id || '',
          title: article.title || 'Pasted source',
          url: article.url || droppedUrl || '',
          snippet: text.slice(0, 360)
        }
      });
      await startBuild({
        pageId: page._id || page.id,
        title: page.title || title
      });
    } catch (err) {
      setError(err?.message || 'Could not build from that material.');
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
      setBuiltPageId('');
      setStep('feed');
    } catch (err) {
      setError(err?.message || 'Could not clear the sample pack.');
    } finally {
      setBusy(false);
    }
  };

  const goToWiki = () => {
    markComplete();
    if (builtPageId) navigate(wikiPagePath(builtPageId), { replace: true });
    else navigate('/wiki', { replace: true });
  };

  // Hand off to the walkthrough, which runs over the live build and ends on the
  // Paper — home. It drives its own navigation from here.
  const showMeAround = () => {
    markComplete();
    startWalkthrough();
  };

  /* The claim is the exit. Writing it finishes onboarding and opens the
     judgment, because the next thing you want is to say why you believe it. */
  const writeFirstClaim = async (event) => {
    event?.preventDefault?.();
    const sentence = claimDraft.trim();
    if (!sentence || claiming) return;
    setClaiming(true);
    setClaimError('');
    try {
      const judgmentId = await createJudgment(sentence, {
        createPage: createWikiPage,
        updatePage: updateWikiPage
      });
      markComplete();
      navigate(`/judgment/${judgmentId}`);
    } catch (failure) {
      setClaimError(failure?.message || 'That claim could not be written down.');
    } finally {
      setClaiming(false);
    }
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
              Noeis is built on your own archive. Connect it and the wiki has something
              true to stand on from the first page.
            </p>
          </div>

          {/* Import leads.
              It used to be a link under a button, below four sample packs — so
              the first thing a new reader was offered was somebody else's
              material, and their own years of reading were an afterthought.
              A wiki built from a starter pack is a demo; a wiki built from your
              archive is yours on the first page. */}
          <div className="wiki-onboarding__archive">
            <Link className="wiki-onboarding__archive-primary" to="/connections#sources">
              Connect your reading archive
            </Link>
            <p>Readwise, Notion, Instapaper, Evernote — whatever you have been saving into.</p>
          </div>

          <label className="wiki-onboarding__paste">
            <span>Or paste a link, or a few paragraphs</span>
            <textarea
              value={pasteText}
              onChange={event => setPasteText(event.target.value)}
              placeholder="Paste a link to something you read this week - or a few paragraphs of it..."
            />
          </label>
          <button type="button" onClick={buildFromPaste} disabled={busy}>Build from this</button>

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
          <p className="wiki-onboarding__eyebrow">{source === 'shared' ? 'Adopted wiki' : 'First page'}</p>
          <h1>{source === 'shared' ? 'This wiki is now yours.' : 'Your first page is ready.'}</h1>
          {/* One ending, not two. This used to close on "add your own material
              next so the graph starts connecting" — a page telling you about
              itself — and then ask for a claim underneath, so the step had two
              endings competing. The page being built is the setup; the claim
              is the ending. */}
          <p>
            {source === 'shared'
              ? 'The agent copied the safe pages into your workspace, and your version can grow without touching the original. One thing left.'
              : 'The agent built it from what you brought in. One thing left.'}
          </p>
          {/* You leave with a claim.
              Onboarding used to end on a page existing — "your first page is
              ready" — which is the product describing itself rather than
              asking anything of you. The thing this product is for is
              committing to something you can be held to, so the last thing it
              does is hand you one. The page you just made is the evidence
              under it. */}
          <form className="wiki-onboarding__claim" onSubmit={writeFirstClaim}>
            <label htmlFor="onboarding-first-claim">
              <strong>Now write one thing you believe.</strong>
              <span>One sentence you would defend. What you just brought in is the evidence under it.</span>
            </label>
            <input
              id="onboarding-first-claim"
              value={claimDraft}
              onChange={event => setClaimDraft(event.target.value)}
              placeholder="Write it as one sentence."
              disabled={claiming}
            />
            <div className="wiki-onboarding__claim-actions">
              <button type="submit" disabled={claiming || !claimDraft.trim()}>
                {claiming ? 'Writing it down…' : 'Write it down'}
              </button>
              <button type="button" className="wiki-onboarding__secondary-action" onClick={goToWiki}>
                Not yet — go to my page
              </button>
            </div>
            {claimError ? <p className="wiki-onboarding__error" role="alert">{claimError}</p> : null}
          </form>

          <div className="wiki-onboarding__hook-actions">
            <button type="button" onClick={showMeAround}>Show me around</button>
            <Link to="/connections#capture">Connect more reading</Link>
          </div>
          {/* The ask, at the moment of felt need: the page they just made has one
              source. Rendered inline rather than linked away — this used to point at
              /connections#capture, which had no capture section to land on. */}
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
