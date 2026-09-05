import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/wiki-critical.css';
import '../styles/agent-rail.css';
import './open-sentence-storyboard.css';
import OpenSentence from '../components/wiki/open-sentence/OpenSentence';
import {
  cancelPlacement,
  closeExploration,
  createExploration,
  keepQuestion,
  keepsClosedDraft,
  openExploration,
  placeSource,
  putItBack,
  restoreExploration,
  setReturnNote,
  snapshotExploration,
  tryWording
} from '../components/wiki/open-sentence/openSentenceModel';
import { readStore, writeStore } from '../components/wiki/open-sentence/openSentenceStore';
import {
  STORYBOARD_LIBRARY_SOURCE,
  STORYBOARD_PAGE_TITLE,
  STORYBOARD_PROVISIONAL,
  STORYBOARD_RETURN_NOTE,
  STORYBOARD_SENTENCE,
  STORYBOARD_SOURCE,
  STORYBOARD_SOURCE_ROOMS,
  storyboardSource
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

const readStored = (source) => restoreExploration(readStore(STORAGE_KEY), seed(source));

const nextSourceRoom = (mode) => {
  const index = STORYBOARD_SOURCE_ROOMS.findIndex((room) => room.id === mode);
  return STORYBOARD_SOURCE_ROOMS[(index + 1) % STORYBOARD_SOURCE_ROOMS.length];
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
  const [sourceMode, setSourceMode] = useState(() => (
    STORYBOARD_SOURCE_ROOMS.some((room) => room.id === params.get('source'))
      ? params.get('source')
      : 'illustrated'
  ));
  const [stillness, setStillness] = useState(() => params.get('still') === '1');
  const source = storyboardSource(sourceMode);
  const sourceRoom = STORYBOARD_SOURCE_ROOMS.find((room) => room.id === sourceMode)
    || STORYBOARD_SOURCE_ROOMS[0];
  const [exploration, setExploration] = useState(() => (
    params.get('beat') ? applyBeat(beat, source) : readStored(source)
  ));
  const [railOpen, setRailOpen] = useState(false);
  const [scene, setScene] = useState('wiki');
  const [libraryExploration, setLibraryExploration] = useState(() => createExploration({
    id: 'illustrated-wrong-turn',
    originalText: STORYBOARD_SOURCE.passage,
    source: STORYBOARD_LIBRARY_SOURCE
  }));
  const [beenToLibrary, setBeenToLibrary] = useState(false);

  useEffect(() => {
    if (exploration.status === 'closed' && !keepsClosedDraft(exploration)) {
      writeStore(STORAGE_KEY, '');
      return;
    }
    writeStore(STORAGE_KEY, snapshotExploration(exploration));
  }, [exploration]);

  const setQuery = (next) => {
    const nextParams = new URLSearchParams();
    const nextBeat = next.beat ?? beat;
    const nextWidth = next.width ?? width;
    const nextSource = Object.prototype.hasOwnProperty.call(next, 'source') ? next.source : (
      sourceMode === 'illustrated' ? '' : sourceMode
    );
    const nextStill = Object.prototype.hasOwnProperty.call(next, 'still') ? next.still : stillness;
    if (nextBeat) nextParams.set('beat', nextBeat);
    if (nextWidth) nextParams.set('width', nextWidth);
    if (nextSource) nextParams.set('source', nextSource);
    if (nextStill) nextParams.set('still', '1');
    const search = nextParams.toString();
    navigate({ pathname: location.pathname || '/design-preview/open-sentence', search: search ? `?${search}` : '' }, { replace: true });
  };

  const companionSubject = scene === 'library'
    ? (libraryExploration.status === 'open' ? STORYBOARD_SOURCE.passage : 'Nomad')
    : (exploration.status === 'open' ? STORYBOARD_SENTENCE : STORYBOARD_PAGE_TITLE);

  const article = useMemo(() => (
    scene === 'library' ? (
      <article className="wiki-read open-sentence-storyboard__article">
        <header className="wiki-read__header">
          <p className="wiki-read__eyebrow">Library</p>
          <h1>Nomad</h1>
        </header>
        <div className="wiki-read__body">
          <p className="open-sentence-library-arrival">
            You were holding {STORYBOARD_SENTENCE}
            <button
              type="button"
              className="open-sentence-library-arrival__back"
              onClick={() => setScene('wiki')}
            >
              Back to Parenting →
            </button>
          </p>
          <p>Getting lost was part of the work. The point was not to avoid every wrong turn.</p>
          <OpenSentence
            key="library-passage"
            exploration={{ ...libraryExploration, source: STORYBOARD_LIBRARY_SOURCE }}
            onChange={(next) => {
              setLibraryExploration(next);
              setExploration((current) => (
                next.placed === current.placed
                  ? current
                  : (next.placed ? placeSource(current) : cancelPlacement(current))
              ));
            }}
            mocked
            stillness={stillness}
            acceptedLabel="The saved passage still reads"
            placeBesideTitle={STORYBOARD_PAGE_TITLE}
          />
          <p>That is a different kind of care than keeping someone from leaving the path at all.</p>
        </div>
      </article>
    ) : (
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
          <p>
            The people who love them want a map with no wrong turns. Maps like that
            stay on the table. They do not teach the ground.
          </p>
          <OpenSentence
            key="wiki-sentence"
            exploration={{ ...exploration, source }}
            onChange={setExploration}
            mocked={Boolean(source?.available)}
            stillness={stillness}
            homecoming={beenToLibrary ? 'You were in Nomad.' : ''}
            onOpenSourceHome={() => {
              setBeenToLibrary(true);
              setScene('library');
            }}
          />
          <p>
            The useful distinction is not whether a mistake happened. It is whether the
            person can continue.
          </p>
          <p>
            That sentence is easy to say and hard to keep. It asks the adult to stay
            near enough to help, and far enough that the child can still find the path
            without being carried.
          </p>
        </div>
      </article>
    )
  ), [beenToLibrary, exploration, libraryExploration, scene, source, stillness]);

  return (
    <div className="open-sentence-storyboard">
      <header className="open-sentence-storyboard__masthead">
        <p className="open-sentence-storyboard__eyebrow">Storyboard · not the live Wiki</p>
        <h1>Open a sentence</h1>
        <p className="open-sentence-storyboard__note">
          The article stays the page. Select the sentence and open it. Closing without
          a question, a return note, or a placed passage forgets the experiment. A note
          under the line is the way home. Source cycles the honest absences. Stillness
          is the open state with no drawing. The Wiki line does not change.
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
                setScene('wiki');
                setBeenToLibrary(false);
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
            aria-label={`Source condition, currently ${sourceRoom.label}. Next condition.`}
            onClick={() => {
              const next = nextSourceRoom(sourceMode);
              setSourceMode(next.id);
              setBeat('open');
              setScene('wiki');
              setQuery({ source: next.id === 'illustrated' ? '' : next.id, beat: 'open' });
              setExploration(applyBeat('open', storyboardSource(next.id)));
            }}
          >
            Source: {sourceRoom.label}
          </button>
          <button
            type="button"
            className={stillness ? 'is-active' : ''}
            aria-pressed={stillness}
            onClick={() => {
              const next = !stillness;
              setStillness(next);
              setQuery({ still: next });
            }}
          >
            Stillness
          </button>
        </div>
      </div>

      <div
        className="open-sentence-storyboard__stage"
        data-width={width}
        data-stillness={stillness ? '1' : undefined}
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
          aria-label={scene === 'library' ? 'Librarian' : 'Wiki steward'}
        >
          <div className="agent-rail__identity">
            <span className="agent-rail__thread" aria-hidden="true">
              <span className="agent-rail__thread-knot" />
            </span>
            <p className="agent-rail__eyebrow">{scene === 'library' ? 'Librarian' : 'Wiki steward'}</p>
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
        From the Library of — {
          scene === 'library'
            ? 'you are in Nomad.'
            : (beenToLibrary ? 'you were in Nomad.' : 'a study, not a live bookplate.')
        }
      </footer>
    </div>
  );
};

export default OpenSentenceStoryboard;
