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

const stageCopy = {
  maintaining: 'Reading the material and choosing the useful shape...',
  drafted: 'Drafting the page in wiki form...',
  saved: 'Saving the article and references...',
  graph_synced: 'Connecting the page to the graph...',
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

const inferTitleFromText = (value = '') => {
  const firstLine = String(value || '').split(/\n+/).map(line => line.trim()).find(Boolean) || 'My first source';
  const words = firstLine.replace(/^https?:\/\/\S+/i, '').split(/\s+/).filter(Boolean).slice(0, 8);
  return words.join(' ') || 'My first source';
};

const firstUrlFromText = (value = '') => {
  const match = String(value || '').trim().match(/^https?:\/\/\S+/i);
  return match ? match[0] : '';
};

const metricLine = ({ pageCount = 0, claimCount = 0, linkCount = 0 } = {}) => (
  `${pageCount} page${pageCount === 1 ? '' : 's'} · ${claimCount} claim${claimCount === 1 ? '' : 's'} · ${linkCount} link${linkCount === 1 ? '' : 's'}`
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
  const [metrics, setMetrics] = useState({ pageCount: adoptedPageId ? 1 : 0, claimCount: 0, linkCount: 0 });
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

  const markComplete = () => {
    localStorage.setItem(COMPLETE_KEY, 'true');
  };

  const runBuildNarration = async ({ pageId, openingLines = [] }) => {
    const seenStages = new Set();
    setStep('build');
    setLines(openingLines);
    setMetrics(prev => ({ ...prev, pageCount: Math.max(prev.pageCount, 1) }));
    const page = await streamMaintainWikiPage(pageId, {}, {
      onEvent: (_event, payload = {}) => {
        const stage = payload.stage || payload.status;
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
      const imported = droppedUrl
        ? await importPastedUrl({ url: droppedUrl })
        : await importPastedText({ text, title: inferTitleFromText(text) });
      const article = imported?.article || {};
      const title = article.title || inferTitleFromText(text);
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
          <ol className="wiki-onboarding__narration">
            {lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
          </ol>
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
          <p className="wiki-onboarding__return">Tomorrow morning, Noeis will look for pages it can grow while you slept.</p>
        </section>
      ) : null}
    </main>
  );
};

export default WikiOnboarding;
