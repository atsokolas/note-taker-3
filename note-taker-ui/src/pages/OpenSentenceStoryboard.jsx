import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/wiki-critical.css';
import '../styles/agent-rail.css';
import './open-sentence-storyboard.css';
import OpenSentence from '../components/wiki/open-sentence/OpenSentence';
import {
  closeExploration,
  createExploration,
  keepQuestion,
  openExploration,
  placeSource,
  putItBack,
  restoreExploration,
  setReturnNote,
  snapshotExploration,
  tryWording
} from '../components/wiki/open-sentence/openSentenceModel';
import {
  STORYBOARD_PAGE_TITLE,
  STORYBOARD_PROVISIONAL,
  STORYBOARD_RETURN_NOTE,
  STORYBOARD_SENTENCE,
  STORYBOARD_SOURCE,
  STORYBOARD_UNAVAILABLE_SOURCE
} from '../components/wiki/open-sentence/openSentenceStoryboardFixture';

const STORAGE_KEY = 'noeis.open-sentence.storyboard.v1';

const WIDTHS = [
  { id: '1440', label: 'Desktop 1440' },
  { id: '1320', label: 'Sidebar 1320' },
  { id: '430', label: 'Mobile 430' }
];

const BEATS = [
  { id: 'read', label: 'Read' },
  { id: 'open', label: 'Opened' },
  { id: 'place', label: 'Placed' },
  { id: 'wording', label: 'Wording' },
  { id: 'question', label: 'Leave open' },
  { id: 'return', label: 'Return' }
];

const seed = (source = STORYBOARD_SOURCE) => createExploration({
  id: 'parenting-room-to-be-wrong',
  originalText: STORYBOARD_SENTENCE,
  source
});

const applyBeat = (beat, source) => {
  const base = seed(source);
  switch (beat) {
    case 'read':
      return closeExploration(base);
    case 'open':
      return openExploration(base);
    case 'place':
      return placeSource(openExploration(base));
    case 'wording':
      return tryWording(placeSource(openExploration(base)), STORYBOARD_PROVISIONAL);
    case 'question':
      return setReturnNote(
        keepQuestion(tryWording(placeSource(openExploration(base)), STORYBOARD_PROVISIONAL), STORYBOARD_RETURN_NOTE),
        STORYBOARD_RETURN_NOTE
      );
    case 'return':
      return setReturnNote(
        keepQuestion(putItBack(placeSource(openExploration(base))), STORYBOARD_RETURN_NOTE),
        STORYBOARD_RETURN_NOTE
      );
    default:
      return closeExploration(base);
  }
};

const readStored = (source) => {
  if (typeof window === 'undefined') return seed(source);
  return restoreExploration(window.sessionStorage.getItem(STORAGE_KEY), seed(source));
};

const OpenSentenceStoryboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [beat, setBeat] = useState(() => (
    BEATS.some((item) => item.id === params.get('beat')) ? params.get('beat') : 'read'
  ));
  const [width, setWidth] = useState(() => (
    WIDTHS.some((item) => item.id === params.get('width')) ? params.get('width') : '1440'
  ));
  const [sourceMode, setSourceMode] = useState(() => {
    if (params.get('source') === 'none') return 'none';
    if (params.get('source') === 'unavailable') return 'unavailable';
    return 'illustrated';
  });
  const silent = sourceMode === 'none';
  const missing = sourceMode === 'unavailable';
  const source = silent ? null : (missing ? STORYBOARD_UNAVAILABLE_SOURCE : STORYBOARD_SOURCE);
  const [exploration, setExploration] = useState(() => (
    params.get('beat') ? applyBeat(beat, source) : readStored(source)
  ));
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(STORAGE_KEY, snapshotExploration(exploration));
  }, [exploration]);

  const setQuery = (next) => {
    const nextParams = new URLSearchParams();
    const nextBeat = next.beat ?? beat;
    const nextWidth = next.width ?? width;
    const nextSource = Object.prototype.hasOwnProperty.call(next, 'source') ? next.source : (
      sourceMode === 'illustrated' ? '' : sourceMode
    );
    if (nextBeat) nextParams.set('beat', nextBeat);
    if (nextWidth) nextParams.set('width', nextWidth);
    if (nextSource) nextParams.set('source', nextSource);
    const search = nextParams.toString();
    navigate({ pathname: location.pathname || '/design-preview/open-sentence', search: search ? `?${search}` : '' }, { replace: true });
  };

  const companionSubject = exploration.status === 'open'
    ? STORYBOARD_SENTENCE
    : STORYBOARD_PAGE_TITLE;

  const article = useMemo(() => (
    <article className="wiki-read open-sentence-storyboard__article">
      <header className="wiki-read__header">
        <p className="wiki-read__eyebrow">Wiki</p>
        <h1>{STORYBOARD_PAGE_TITLE}</h1>
      </header>
      <div className="wiki-read__body">
        <p>
          Care is not the same as preventing every scrape. A child who never meets a
          recoverable failure also never learns the shape of the world.
        </p>
        <OpenSentence
          exploration={{ ...exploration, source }}
          onChange={setExploration}
          mocked={!silent && !missing}
        />
        <p>
          The useful distinction is not whether a mistake happened. It is whether the
          person can continue.
        </p>
      </div>
    </article>
  ), [exploration, missing, silent, source]);

  return (
    <div className="open-sentence-storyboard">
      <header className="open-sentence-storyboard__masthead">
        <p className="open-sentence-storyboard__eyebrow">Storyboard · not the live Wiki</p>
        <h1>Open a sentence</h1>
        <p className="open-sentence-storyboard__note">
          The article stays the page. Select the sentence and open it. The pocket is
          a private experiment. Reload keeps the draft in this tab. The Wiki line does
          not change.
        </p>
      </header>

      <div className="open-sentence-storyboard__controls" aria-label="Storyboard controls">
        <div className="open-sentence-storyboard__beats" role="tablist" aria-label="Scene">
          {BEATS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={beat === item.id ? 'is-active' : ''}
              onClick={() => {
                setBeat(item.id);
                setQuery({ beat: item.id });
                setExploration(applyBeat(item.id, source));
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="open-sentence-storyboard__widths" aria-label="Width">
          {WIDTHS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={width === item.id ? 'is-active' : ''}
              onClick={() => {
                setWidth(item.id);
                setQuery({ width: item.id });
              }}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={silent ? 'is-active' : ''}
            onClick={() => {
              const next = silent ? 'illustrated' : 'none';
              setSourceMode(next);
              setBeat('open');
              setQuery({ source: next === 'illustrated' ? '' : next, beat: 'open' });
              setExploration(applyBeat('open', next === 'none' ? null : STORYBOARD_SOURCE));
            }}
          >
            Silence
          </button>
        </div>
      </div>

      <div
        className="open-sentence-storyboard__stage"
        data-width={width}
        style={{ '--storyboard-width': `${width}px` }}
      >
        {width === '430' ? (
          <button
            type="button"
            className="open-sentence-storyboard__drawer"
            onClick={() => setRailOpen((current) => !current)}
          >
            {railOpen ? 'Close companion' : 'Companion'}
          </button>
        ) : null}
        {article}
        <aside
          className={`agent-rail open-sentence-storyboard__rail${railOpen ? ' is-open' : ''}`}
          aria-label="Wiki steward"
        >
          <div className="agent-rail__identity">
            <span className="agent-rail__thread" aria-hidden="true">
              <span className="agent-rail__thread-knot" />
            </span>
            <p className="agent-rail__eyebrow">Wiki steward</p>
          </div>
          <p className="agent-rail__role-description">
            Works beside the article. Does not become a second chat in the pocket.
          </p>
          <p className="agent-rail__subject">
            <span>Now with</span>
            {companionSubject}
          </p>
        </aside>
      </div>

      <footer className="open-sentence-storyboard__colophon">
        <span className="open-sentence-storyboard__mark" aria-hidden="true" />
        From the Library of — a study, not a live bookplate.
      </footer>
    </div>
  );
};

export default OpenSentenceStoryboard;
