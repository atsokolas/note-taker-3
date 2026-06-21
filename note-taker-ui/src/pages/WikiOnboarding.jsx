import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  adoptWikiStarterPack,
  createWikiPage,
  deleteWikiPage,
  listWikiStarterPacks,
  streamMaintainWikiPage
} from '../api/wiki';
import { importPastedText, importPastedUrl } from '../api/imports';
import { wikiPagePath } from '../utils/wikiFeatureFlags';

const COMPLETE_KEY = 'noeis.wikiOnboardingComplete';
const FAST_BUILD_OPTIONS = {
  maintenanceProfile: 'fast',
  sourceLimit: 8,
  sourceTextLimit: 800,
  inlineAutolinkLimit: 150,
  skipQualityRebuild: true,
  // Render [hf-timing] logs (2026-06-21): the streamed draft took ~31s
  // (totalMs=30796) while the SAME groq+gpt-oss-120b call in blocking mode
  // finished in 2-5s. The HF router trickles tokens for this model, so
  // streaming costs ~26s for zero functional gain — the elapsed ticker and
  // narration already carry perceived progress. Use the fast blocking call.
  streamDraft: false,
  deferInboundAutolinks: true
};

const stageCopy = {
  maintaining: 'Reading the material and choosing the useful shape...',
  drafted: 'Drafting the page in wiki form...',
  saved: 'Saving the article and references...',
  graph_synced: 'Connecting the page to the graph...',
  model_streaming: 'The article is starting to write itself...',
  quality_rebuild_deferred: 'Saving the first readable draft now; deeper polish will happen in the background.',
  inbound_links_deferred: 'Backlinks will settle in the background while you start reading.',
  complete: 'Ready. The page is alive in your wiki.'
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

const titleCaseConcept = (value = '') => (
  String(value || '')
    .replace(/[“”"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((word) => {
      const lower = word.toLowerCase();
      if (['and', 'or', 'of', 'the', 'a', 'an', 'to', 'in', 'for'].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/\b([A-Z][a-z]+)\s+(and|or|of|the|a|an|to|in|for)\b/g, (match) => match)
);

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

const firstUrlFromText = (value = '') => {
  const match = String(value || '').trim().match(/^https?:\/\/\S+/i);
  return match ? match[0] : '';
};

const metricLine = ({ pageCount = 0, claimCount = 0, linkCount = 0 } = {}) => (
  `${pageCount} page${pageCount === 1 ? '' : 's'} · ${claimCount} claim${claimCount === 1 ? '' : 's'} · ${linkCount} link${linkCount === 1 ? '' : 's'}`
);

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
  const [selectedPackId, setSelectedPackId] = useState('mental-models');
  const [pasteText, setPasteText] = useState('');
  const [lines, setLines] = useState([]);
  const [draftPreview, setDraftPreview] = useState('');
  const [metrics, setMetrics] = useState({ pageCount: adoptedPageId ? 1 : 0, claimCount: 0, linkCount: 0 });
  const [builtPageId, setBuiltPageId] = useState(adoptedPageId);
  const [adoptedStarterPages, setAdoptedStarterPages] = useState([]);
  const [adoptedPack, setAdoptedPack] = useState(null);
  const [mergeAvailable, setMergeAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [workingSeconds, setWorkingSeconds] = useState(0);

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

  useEffect(() => {
    if (step !== 'build' || !busy) {
      setWorkingSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    setWorkingSeconds(0);
    const timer = window.setInterval(() => {
      setWorkingSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy, step]);

  const markComplete = () => {
    localStorage.setItem(COMPLETE_KEY, 'true');
  };

  const runBuildNarration = async ({ pageId, openingLines = [] }) => {
    const seenStages = new Set();
    setStep('build');
    setLines(openingLines);
    setDraftPreview('');
    setMetrics(prev => ({ ...prev, pageCount: Math.max(prev.pageCount, 1) }));
    const page = await streamMaintainWikiPage(pageId, FAST_BUILD_OPTIONS, {
      onEvent: (_event, payload = {}) => {
        const stage = payload.stage || payload.status;
        if (stage === 'model_streaming' && payload.delta) {
          setDraftPreview(prev => `${prev} ${payload.delta}`.replace(/\s+/g, ' ').trim().slice(-900));
        }
        if (!stage || seenStages.has(stage)) return;
        seenStages.add(stage);
        setLines(prev => [...prev, stageCopy[stage] || payload.summary || `Agent stage: ${stage}`]);
      },
      onPage: (nextPage) => {
        setMetrics({
          pageCount: 1,
          claimCount: Number(nextPage?.claimCount || nextPage?.claims?.length || 0),
          linkCount: Number(nextPage?.sourceCount || nextPage?.sourceRefs?.length || 0)
        });
      }
    });
    const finalPageId = page?._id || page?.id || pageId;
    setBuiltPageId(finalPageId);
    setLines(prev => (prev.some(line => /ready/i.test(line)) ? prev : [...prev, 'Ready. The page is alive in your wiki.']));
    markComplete();
    setStep('hook');
  };

  const adoptStarterPack = async () => {
    setBusy(true);
    setError('');
    try {
      setStep('build');
      setLines([
        `Pulling in ${selectedPack.name}...`,
        'Creating the starter pages and preserving their internal links...'
      ]);
      const result = await adoptWikiStarterPack(selectedPack.id);
      const pages = Array.isArray(result.pages) ? result.pages : [];
      setAdoptedStarterPages(pages);
      setAdoptedPack(result.pack || selectedPack);
      setMergeAvailable(Boolean(result.mergeAvailable));
      const firstPage = pages[0] || {};
      setBuiltPageId(firstPage._id || firstPage.id || '');
      setMetrics({
        pageCount: pages.length || selectedPack.pageCount || 1,
        claimCount: pages.reduce((sum, page) => sum + Number(page.claimCount || page.claims?.length || 0), 0),
        linkCount: pages.reduce((sum, page) => sum + Number(page.sourceCount || page.sourceRefs?.length || 0), 0)
      });
      if (firstPage?._id || firstPage?.id) {
        await runBuildNarration({
          pageId: firstPage._id || firstPage.id,
          openingLines: [
            `Pulled in ${selectedPack.name}.`,
            'Refreshing the first page so it belongs to this workspace...'
          ]
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
    if (!text) {
      setError('Paste a link or a few paragraphs first.');
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
      await runBuildNarration({
        pageId: page._id || page.id,
        openingLines: [
          'Reading what you dropped in...',
          `Creating a first page called "${page.title || title}"...`
        ]
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
      setMetrics({ pageCount: 0, claimCount: 0, linkCount: 0 });
      setLines([]);
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
            <h1>Start with a foundation.</h1>
            <p>Choose a starter pack, connect your reading, or paste one thing you read this week.</p>
          </div>
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
            <Link to="/connections">Connect Readwise or Notion</Link>
          </div>
          <label className="wiki-onboarding__paste">
            <span>Or paste a link or text</span>
            <textarea
              value={pasteText}
              onChange={event => setPasteText(event.target.value)}
              placeholder="Drop in something you read this week..."
            />
          </label>
          <button type="button" onClick={buildFromPaste} disabled={busy}>Build from this</button>
          {error ? <p className="wiki-onboarding__error" role="alert">{error}</p> : null}
        </section>
      ) : null}

      {step === 'build' ? (
        <section className="wiki-onboarding__panel wiki-onboarding__panel--build">
          <p className="wiki-onboarding__eyebrow">Building your wiki</p>
          <h1>The agent is making the first page useful.</h1>
          <div className="wiki-onboarding__counter">{metricLine(metrics)}</div>
          {busy ? (
            <p className="wiki-onboarding__working-pulse" role="status">
              Still shaping the draft · {workingSeconds}s elapsed
            </p>
          ) : null}
          <ol className="wiki-onboarding__narration">
            {lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
          </ol>
          {draftPreview ? (
            <div className="wiki-onboarding__draft-preview" aria-label="Live draft preview">
              <span>Live draft</span>
              <p>{draftPreview}</p>
            </div>
          ) : null}
          <button type="button" onClick={goToWiki}>Skip to my wiki</button>
        </section>
      ) : null}

      {step === 'hook' ? (
        <section className="wiki-onboarding__panel wiki-onboarding__panel--hook">
          <p className="wiki-onboarding__eyebrow">{source === 'shared' ? 'Adopted wiki' : 'First page'}</p>
          <h1>{source === 'shared' ? 'This wiki is now yours.' : 'Your first page is ready.'}</h1>
          <p>
            {source === 'shared'
              ? 'The agent copied the safe pages into your workspace. Your version can now grow without exposing the original owner’s data.'
              : 'The agent built the foundation. Add your own material next so the graph starts connecting.'}
          </p>
          <div className="wiki-onboarding__hook-actions">
            <button type="button" onClick={goToWiki}>Go to my wiki</button>
            <Link to="/connections">Connect reading</Link>
            <Link to="/wiki">Explore pages</Link>
          </div>
          <section className="wiki-onboarding__save-habit" aria-label="Save from anywhere">
            <div>
              <strong>Make saving frictionless next.</strong>
              <p>Add the browser save flow so the next useful passage can land in Noeis without coming back to this setup screen.</p>
            </div>
            <Link to="/connections#capture">Set up browser save</Link>
          </section>
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
