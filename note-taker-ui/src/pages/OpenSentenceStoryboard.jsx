import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/wiki-critical.css';
import '../styles/agent-rail.css';
import OpenSentence from '../components/wiki/open-sentence/OpenSentence';
import {
  acceptWording,
  beginPressure,
  cancelPlacement,
  createExploration,
  inspectableOther,
  isOpen,
  isPressured,
  keepQuestion,
  liveThen,
  openExploration,
  placeSource,
  putItBack,
  setMeetField,
  setPressureField,
  setReturnNote,
  tryWording,
  wikiAcceptedText
} from '../components/wiki/open-sentence/openSentenceModel';
import {
  keepExploration,
  readRemembered
} from '../components/wiki/open-sentence/openSentenceJourney';
import {
  STORYBOARD_COMPUTE_ID,
  STORYBOARD_COMPUTE_SENTENCE,
  STORYBOARD_COMPUTE_SOURCE,
  STORYBOARD_COMPUTE_TITLE,
  STORYBOARD_ITEM_ID,
  STORYBOARD_LIBRARY_SOURCE,
  STORYBOARD_MEET_LIMIT,
  STORYBOARD_MEET_RELATION,
  STORYBOARD_MEET_SOURCE,
  STORYBOARD_PAGE_TITLE,
  STORYBOARD_PREMISE,
  STORYBOARD_PROVISIONAL,
  STORYBOARD_RETURN_NOTE,
  STORYBOARD_SCOPE,
  STORYBOARD_SENTENCE,
  STORYBOARD_SOURCE,
  STORYBOARD_SOURCE_ROOMS,
  STORYBOARD_THEN_NOW,
  storyboardSource
} from '../components/wiki/open-sentence/openSentenceStoryboardFixture';
import './open-sentence-storyboard.css';

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
  { id: 'return', label: 'Return' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'then', label: 'Then' },
  { id: 'meet', label: 'Meet' }
];

const seed = (source = STORYBOARD_SOURCE) => createExploration({
  id: STORYBOARD_ITEM_ID,
  originalText: STORYBOARD_SENTENCE,
  source
});

const computeSeed = () => createExploration({
  id: STORYBOARD_COMPUTE_ID,
  originalText: STORYBOARD_COMPUTE_SENTENCE,
  source: STORYBOARD_COMPUTE_SOURCE
});

const thenSeed = () => createExploration({
  id: STORYBOARD_COMPUTE_ID,
  originalText: STORYBOARD_THEN_NOW,
  source: STORYBOARD_COMPUTE_SOURCE,
  then: { text: STORYBOARD_COMPUTE_SENTENCE }
});

const meetSeed = () => {
  const opened = openExploration(createExploration({
    id: STORYBOARD_ITEM_ID,
    originalText: STORYBOARD_SENTENCE,
    source: STORYBOARD_SOURCE,
    other: STORYBOARD_MEET_SOURCE
  }));
  return setMeetField(
    setMeetField(opened, 'relation', STORYBOARD_MEET_RELATION),
    'limit',
    STORYBOARD_MEET_LIMIT
  );
};

const applyBeat = (beat, source) => {
  if (beat === 'pressure') {
    return setPressureField(
      beginPressure(openExploration(computeSeed())),
      'premise',
      STORYBOARD_PREMISE
    );
  }
  if (beat === 'then') {
    return openExploration(thenSeed());
  }
  if (beat === 'meet') {
    return meetSeed();
  }
  const opened = openExploration(seed(source));
  const placed = placeSource(opened);
  const worded = tryWording(placed, STORYBOARD_PROVISIONAL);
  const questioned = setReturnNote(
    keepQuestion(worded, STORYBOARD_RETURN_NOTE),
    STORYBOARD_RETURN_NOTE
  );
  switch (beat) {
    case 'open':
      return opened;
    case 'place':
      return placed;
    case 'wording':
      return worded;
    case 'question':
      return questioned;
    case 'return':
      return setReturnNote(
        keepQuestion(putItBack(worded), STORYBOARD_RETURN_NOTE),
        STORYBOARD_RETURN_NOTE
      );
    default:
      return seed(source);
  }
};

const nextSourceRoom = (mode) => {
  const index = STORYBOARD_SOURCE_ROOMS.findIndex((room) => room.id === mode);
  return STORYBOARD_SOURCE_ROOMS[(index + 1) % STORYBOARD_SOURCE_ROOMS.length];
};

const BESIDE_SENTENCE = 'Works beside this sentence. Does not rewrite the article.';
const BESIDE_ARTICLE = 'Works beside the article. Does not become a second chat in the pocket.';

const companionRole = (scene, exploration, libraryExploration) => {
  if (scene === 'library') {
    return isOpen(libraryExploration) ? BESIDE_SENTENCE : BESIDE_ARTICLE;
  }
  if (isPressured(exploration)) {
    return 'The original stays. The experiment is not a generated causal chain.';
  }
  if (inspectableOther(exploration)) {
    return 'Both ends are inspectable. The space between is yours.';
  }
  if (liveThen(exploration)) {
    return 'The earlier wording is recorded. It is not a reconstructed biography.';
  }
  return isOpen(exploration) ? BESIDE_SENTENCE : BESIDE_ARTICLE;
};

export const patchStoryboardSearch = (currentSearch, patch = {}) => {
  const nextParams = new URLSearchParams(
    String(currentSearch || '').replace(/^\?/, '')
  );
  Object.entries(patch).forEach(([key, value]) => {
    if (key === 'still') {
      if (value) nextParams.set('still', '1');
      else nextParams.delete('still');
      return;
    }
    if (value) nextParams.set(key, String(value));
    else nextParams.delete(key);
  });
  const search = nextParams.toString();
  return search ? `?${search}` : '';
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
    params.get('beat')
      ? applyBeat(beat, source)
      : readRemembered(STORYBOARD_SCOPE, STORYBOARD_ITEM_ID, seed(source))
  ));
  const [railOpen, setRailOpen] = useState(false);
  const [scene, setScene] = useState('wiki');
  const [libraryExploration, setLibraryExploration] = useState(() => createExploration({
    id: STORYBOARD_SOURCE.highlightId,
    originalText: STORYBOARD_SOURCE.passage,
    source: STORYBOARD_LIBRARY_SOURCE
  }));
  const [beenToLibrary, setBeenToLibrary] = useState(false);

  useEffect(() => {
    const live = exploration.id === STORYBOARD_COMPUTE_ID
      ? createExploration({
        id: STORYBOARD_COMPUTE_ID,
        originalText: exploration.originalText || STORYBOARD_COMPUTE_SENTENCE,
        source: STORYBOARD_COMPUTE_SOURCE,
        then: exploration.then
      })
      : createExploration({
        id: STORYBOARD_ITEM_ID,
        originalText: STORYBOARD_SENTENCE,
        source,
        other: exploration.other
      });
    keepExploration(STORYBOARD_SCOPE, exploration.id || STORYBOARD_ITEM_ID, exploration, live);
  }, [exploration, source]);

  const setQuery = (patch) => {
    const search = patchStoryboardSearch(location.search, patch);
    navigate({ pathname: location.pathname || '/design-preview/open-sentence', search }, { replace: true });
  };

  const computeWalk = exploration.id === STORYBOARD_COMPUTE_ID;
  const thenLine = liveThen(exploration);
  const companionSubject = scene === 'library'
    ? (isOpen(libraryExploration) ? wikiAcceptedText(libraryExploration) : 'Nomad')
    : (isOpen(exploration)
      ? wikiAcceptedText(exploration)
      : (computeWalk ? STORYBOARD_COMPUTE_TITLE : STORYBOARD_PAGE_TITLE));

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
    ) : computeWalk ? (
      <article className="wiki-read open-sentence-storyboard__article">
        <header className="wiki-read__header">
          <p className="wiki-read__eyebrow">Wiki</p>
          <h1>{STORYBOARD_COMPUTE_TITLE}</h1>
        </header>
        <div className="wiki-read__body">
          <p>
            Supply was the constraint this decade. That is not a proof about the next one.
          </p>
          <OpenSentence
            key="compute-sentence"
            exploration={{ ...exploration, source: STORYBOARD_COMPUTE_SOURCE }}
            onChange={setExploration}
            mocked
            stillness={stillness}
            onAccept={(current) => setExploration(acceptWording(current))}
          />
          <p>
            {thenLine
              ? 'The earlier wording is recorded. It is not a reconstructed biography. It does not write the article.'
              : 'A slower-demand experiment is not a forecast. It names a pressure. It does not write the article.'}
          </p>
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
            onAccept={(current) => setExploration(acceptWording(current))}
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
  ), [beenToLibrary, computeWalk, exploration, libraryExploration, scene, source, stillness, thenLine]);

  return (
    <div className="open-sentence-storyboard">
      <header className="open-sentence-storyboard__masthead">
        <p className="open-sentence-storyboard__eyebrow">Storyboard · not the live Wiki</p>
        <h1>Open a sentence</h1>
        <p className="open-sentence-storyboard__note">
          The article stays the page. Select the sentence and open it. Closing without
          a question, a return note, a placed passage, a proposed wording, a named
          premise, a named meeting, or a note written between them forgets the experiment. A note under the line is the way home.
          Source cycles the honest absences. Stillness is the open state with no
          drawing. Propose names a wording; Accept is what writes the illustrated
          line. Pressure names a premise beside the original. It does not invent a
          causal chain. Then names an earlier recorded line. It is not a biography.
          Meet names how two recorded passages sit together, and where that stops.
          The space between is yours. A note written there can stay a note.
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
            {companionRole(scene, exploration, libraryExploration)}
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
