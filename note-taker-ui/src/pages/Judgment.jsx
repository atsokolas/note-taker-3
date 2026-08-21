import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  askWikiPage,
  createWikiPage,
  downloadJudgmentPamphlet,
  getJudgmentLibraryEvidence,
  getWikiPage,
  setWikiPageEvergreen,
  listWikiPages,
  listWikiSourceEvents,
  updateWikiPage
} from '../api/wiki';
import { getArticles } from '../api/articles';
import { useAgentRail, useAgentRailSurface } from '../agent/AgentRailContext';
import EvergreenToggle from '../components/EvergreenToggle';
import ReadingDrift from '../components/ReadingDrift';
import { flySentenceInto, takeFirstPaint } from '../motion/columnMotion';
import {
  acceptProposalIntoJudgment,
  addDependency,
  dependencyLines,
  fileEvidenceIntoJudgment,
  parkJudgment,
  removeDependency,
  restingOn,
  resumeJudgment,
  answerProvenance,
  buildJudgmentIndex,
  createJudgment,
  docText,
  formatLedgerDate,
  oneSentence,
  projectJudgment,
  newLineId,
  selectOvernightLine,
  upsertLineIntoJudgment
} from './judgmentModel';
import '../styles/wiki-front-page.css';
import '../styles/judgment.css';

// Judgment.
//
// One claim, one column, and the four things a person actually keeps: why they
// believe it, what argues against it, what would change their mind, and what
// they did about it. Agents retrieve; the human accepts. Nothing an agent
// brings back is written down until a person says so, and nothing already
// written down is edited by anything that arrives later.
//
// The retrieving happens in the rail, which is not part of this page — it was
// already on screen before this column arrived and it will still be there after
// the column changes. This page only tells it what it is looking at.

const COUNTER_QUESTION = 'What in my library argues against this claim? Answer in one sentence.';

/* What a save has to come back holding. Read off the stored contract rather
   than the projection, because this is checking what the server kept. */
const JUDGMENT_LINE_FIELDS = ['why', 'against', 'falsifiers', 'decisions'];
const countJudgmentLines = (judgment = {}) => JUDGMENT_LINE_FIELDS.reduce((counts, field) => ({
  ...counts,
  [field]: Array.isArray(judgment?.[field]) ? judgment[field].length : 0
}), {});
const SOURCE_EVENT_LIMIT = 40;

const isExternal = (href = '') => /^https?:\/\//i.test(href);

/** Sources read as the publications they are: "SemiAnalysis and TrendForce". */
const SourceLine = ({ sources = [] }) => {
  if (!sources.length) return null;
  return (
    <p className="judgment__sources">
      {sources.map((source, index) => (
        <React.Fragment key={source.id}>
          {index > 0 ? <span>{index === sources.length - 1 ? ' and ' : ', '}</span> : null}
          {source.href
            ? (isExternal(source.href)
              ? <a href={source.href} target="_blank" rel="noreferrer">{source.label}</a>
              : <Link to={source.href}>{source.label}</Link>)
            : <span className="judgment__source-plain">{source.label}</span>}
        </React.Fragment>
      ))}
    </p>
  );
};

/* The four sections are the page, so all four are on it.
   An empty one is still not a box to fill in with something plausible — it is
   the question that section asks, and one line to answer it.

   The line writes itself down. There was a Write button, which meant a
   sentence you had typed but not submitted was not saved anywhere — you could
   fill in all four fields, look away, and have written nothing. Typing updates
   the same line in place; Enter finishes it and starts another. */
const AUTOSAVE_PAUSE_MS = 700;

const Field = ({ label, lines = [], sources = [], prompt = '', field, onWrite, children }) => {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState('idle');   // idle | saving | saved | error
  const [writeError, setWriteError] = useState('');
  const lineIdRef = useRef('');
  const timerRef = useRef(0);
  const id = `judgment-field-${label.replace(/\W+/g, '-').toLowerCase()}`;

  const save = useCallback(async (text) => {
    const line = text.trim();
    if (!line || !onWrite) return;
    if (!lineIdRef.current) lineIdRef.current = newLineId(field || 'line');
    setState('saving');
    setWriteError('');
    try {
      await onWrite(line, lineIdRef.current);
      setState('saved');
      return true;
    } catch (failure) {
      setState('error');
      setWriteError(
        failure?.response?.data?.error
        || failure?.message
        || 'That line could not be saved.'
      );
      return false;
    }
  }, [field, onWrite]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const type = (value) => {
    setDraft(value);
    setState(value.trim() ? 'typing' : 'idle');
    window.clearTimeout(timerRef.current);
    if (value.trim()) timerRef.current = window.setTimeout(() => save(value), AUTOSAVE_PAUSE_MS);
  };

  /* Enter finishes this line and starts the next one. Blur just makes sure
     what is on screen is also written down. */
  /* Enter finishes this line and starts the next one. So does leaving the
     field — the sentence settles into the section as a line rather than
     staying in the box you typed it in. The text is only cleared once it is
     actually written down; a failed save keeps it on screen to be retried. */
  const finish = async () => {
    window.clearTimeout(timerRef.current);
    if (!draft.trim()) return;
    const written = await save(draft);
    if (!written) return;
    lineIdRef.current = '';
    setDraft('');
    setState('idle');
  };

  /* The line being written lives in the input, not twice on the page. */
  const settled = lines.filter(line => line.id !== lineIdRef.current);

  return (
    <section className="judgment__field" aria-labelledby={id}>
      <h2 id={id}>{label}</h2>
      {settled.map(line => <p key={line.id} className="judgment__line">{line.text}</p>)}
      {/* The heading stays and admits the section is empty, rather than hiding
          behind an accordion or leaving the reader unsure it saved. */}
      {settled.length ? null : <p className="judgment__line judgment__line--empty">Nothing here yet.</p>}
      <SourceLine sources={sources} />
      {children}
      {onWrite ? (
        <div className="judgment__write">
          <label className="sr-only" htmlFor={`${id}-write`}>{prompt || `Add a line to ${label}`}</label>
          <input
            id={`${id}-write`}
            value={draft}
            onChange={(event) => type(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              finish();
            }}
            placeholder={prompt}
          />
          <span className="judgment__write-state" aria-live="polite">
            {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
          </span>
          {writeError ? <span role="alert">{writeError}</span> : null}
        </div>
      ) : null}
    </section>
  );
};

/* The overnight line: one sentence, then two words. Accept resolves in place
   into the choice of field — the human decides which of the two it is — and the
   line settles into that field. Dismiss evaporates it. Height eases either way
   and nothing jumps; there is no toast, because the page itself is the receipt. */
const OvernightLine = ({ proposal, busy, onAccept, onDismiss }) => {
  const [choosing, setChoosing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const leave = (run) => {
    setLeaving(true);
    window.setTimeout(run, 200);
  };

  return (
    <div className={`judgment__proposal${leaving ? ' is-leaving' : ''}`} role="group" aria-label="Overnight agent line">
      <p className="judgment__proposal-sentence">{proposal.sentence}</p>
      <span className="judgment__proposal-actions">
        {choosing ? (
          <>
            <button type="button" disabled={busy} onClick={() => leave(() => onAccept(proposal, 'why'))}>Why</button>
            <button type="button" disabled={busy} onClick={() => leave(() => onAccept(proposal, 'against'))}>Against</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setChoosing(true)}>Accept</button>
            <button type="button" disabled={busy} onClick={() => leave(() => onDismiss(proposal))}>Dismiss</button>
          </>
        )}
      </span>
    </div>
  );
};

const JudgmentIndex = ({ items, articles, readingUnreadable }) => {
  const arriving = useMemo(() => takeFirstPaint('judgment-index'), []);
  const enter = arriving ? 'wfp-anim wfp-anim--2' : 'judgment-return';

  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  /* The claim is the page. A judgment is a wiki page carrying a judgment
     contract, so writing one down creates that page and puts the sentence in
     it — then opens it, because the next thing you want is to say why. */
  const submitClaim = useCallback(async (event) => {
    event?.preventDefault?.();
    const sentence = oneSentence(draft);
    if (!sentence || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const id = await createJudgment(sentence, {
        createPage: createWikiPage,
        updatePage: updateWikiPage
      });
      setDraft('');
      navigate(`/judgment/${id}`);
    } catch (error) {
      setCreateError(error?.message || 'The judgment could not be created.');
    } finally {
      setCreating(false);
    }
  }, [creating, draft, navigate]);

  // The index is a list of sentences, not a thing to interrogate. The rail
  // stays where it is and waits for one of them to be opened.
  useAgentRailSurface({ id: 'judgment-index', subject: 'Your judgments.' }, {});

  return (
    <main className="judgment judgment--index" aria-labelledby="judgment-index-title">
      <h1 className="sr-only" id="judgment-index-title">All judgments</h1>
      {/* Where the reading has been going, above the beliefs it produced. It
          is the one thing in the product that asks nothing of you, and it
          belongs at the top of the room that asks the most: this is the
          weather over the claims, not another claim. */}
      <ReadingDrift articles={articles} unreadable={readingUnreadable} />
      {/* A judgment starts by being written down. Before this the index could
          only list what already existed, and the empty state told you a
          judgment begins the day you write one without giving you anywhere to
          write it. One line, and the sentence you type is the claim. */}
      <form className={`judgment__new ${enter}`} onSubmit={submitClaim}>
        <label htmlFor="judgment-new-claim">What do you think is true?</label>
        <input
          id="judgment-new-claim"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write the claim as one sentence."
          disabled={creating}
        />
        <div className="judgment__new-actions">
          <button type="submit" disabled={creating || !draft.trim()}>
            {creating ? 'Writing it down…' : 'Write it down'}
          </button>
          {createError ? <span role="alert">{createError}</span> : null}
        </div>
      </form>
      {items.length ? (
        <>
          <ul className={`judgment__index ${enter}`}>
            {items.map(item => (
              <li key={item.id} data-state={item.state}>
                <Link to={`/judgment/${item.id}`}>{item.sentence}</Link>
                {/* Only two states say anything. A claim nothing has arrived
                    for is not a problem, and a claim you have been reading
                    about does not need to be announced — so the index is
                    allowed to be completely silent, which is the point. */}
                {item.note ? <span className="judgment__index-note">{item.note}</span> : null}
                {/* Counted rather than hidden: a claim written down five times
                    is worth knowing about, and silently dropping four of them
                    would look like the product losing your work. */}
                {item.duplicates ? (
                  <span className="judgment__index-note judgment__index-dupes">
                    {item.duplicates} more {item.duplicates === 1 ? 'copy' : 'copies'} of this claim
                  </span>
                ) : null}
                {/* What holding it taught you, under the claim it came out of.
                    A lesson gathered into a list of its own is a fortune
                    cookie; here it is a record of what believing that cost. */}
                {item.lessons.length ? (
                  <ul className="judgment__index-lessons">
                    {item.lessons.map(lesson => (
                      <li key={lesson.id}>{lesson.text}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {/* One way in to the week, from the surface the week is mostly
              about — its own back-link says All judgments. Not a row of doors
              this time: the week is the only one of the three that is not
              already folded into a room you can reach. */}
          <p className={`judgment__week-door ${enter}`}>
            <Link to="/week">Your week →</Link>
          </p>
        </>
      ) : (
        /* A door, not a form. The composer used to be the only thing on an
           empty index, which made the product look like a text box. The claim
           usually comes from something you were already reading. */
        <div className={`judgment__nothing ${enter}`}>
          <p>No claims yet.</p>
          <p className="judgment__nothing-door">
            <Link to="/wiki">Start one from this morning&rsquo;s paper.</Link>
          </p>
        </div>
      )}
    </main>
  );
};

/*
 * What your library already said about this.
 *
 * The judgment could only be filled by typing into it, or by accepting a line
 * an agent happened to bring past. Everything the reader had already saved and
 * marked as worth keeping sat one room away and could not be reached from the
 * claim it bore on.
 *
 * The agent retrieves. Every candidate arrives with the source it came from
 * and the words that matched, and it is offered rather than filed — because
 * whether a passage supports a claim or cuts against it is the question the
 * page exists to ask, and no amount of word overlap answers it.
 */
const LibraryEvidence = ({ pageId, onFile }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [filingId, setFilingId] = useState('');

  const look = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const found = await getJudgmentLibraryEvidence(pageId);
      setCandidates(found.candidates);
    } catch (lookError) {
      setError(lookError?.response?.data?.error || 'Your library could not be searched right now.');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  const file = async (candidate, field) => {
    setFilingId(candidate.id);
    setError('');
    try {
      await onFile(candidate, field);
      setCandidates(current => (current || []).filter(item => item.id !== candidate.id));
    } catch (fileError) {
      setError(fileError?.message || 'That line was not saved.');
    } finally {
      setFilingId('');
    }
  };

  if (!open) {
    return (
      <button type="button" className="judgment__look" onClick={look}>
        Look in your library →
      </button>
    );
  }

  return (
    <section className="judgment-evidence" aria-label="Evidence from your library">
      <div className="judgment-evidence__head">
        <span>From your library</span>
        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </div>
      {loading ? <p className="judgment-evidence__quiet" role="status">Looking through what you have saved…</p> : null}
      {error ? <p className="judgment-evidence__error" role="alert">{error}</p> : null}
      {!loading && candidates && candidates.length === 0 ? (
        <p className="judgment-evidence__quiet">
          Nothing you have saved speaks to this yet. That is worth knowing about a claim you hold.
        </p>
      ) : null}
      {candidates && candidates.length ? (
        <ol className="judgment-evidence__list">
          {candidates.map(candidate => (
            <li key={candidate.id} className="judgment-evidence__item">
              <blockquote>{candidate.text}</blockquote>
              <p className="judgment-evidence__source">
                {candidate.sourceLabel}
                {candidate.kind === 'source' ? <span> · not highlighted, from the body</span> : null}
              </p>
              {/* Which side it falls on is the reader's call, and it is the
                  whole question the page is asking. */}
              <div className="judgment-evidence__file">
                <span>File under</span>
                <button type="button" disabled={Boolean(filingId)} onClick={() => file(candidate, 'why')}>
                  {filingId === candidate.id ? 'Filing…' : 'Why'}
                </button>
                <button type="button" disabled={Boolean(filingId)} onClick={() => file(candidate, 'against')}>
                  Against
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
};

/*
 * Park, and the lesson.
 *
 * There were three moves and one of them was Retire, which means "I no longer
 * believe this". A belief you have simply stopped tending is a different
 * thing, and forcing it through Retire made it leave the list looking
 * abandoned — so instead it stayed, and the list filled with claims nobody was
 * watching.
 *
 * Parking asks one question on the way out, and it is the only question worth
 * asking at that moment: what did holding this teach you? The answer outlives
 * the claim. It is optional, because sometimes there isn't one.
 */
const ParkJudgment = ({ parked, supports = [], onPark, onResume }) => {
  const [asking, setAsking] = useState(false);
  const [lesson, setLesson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setAsking(false);
      setLesson('');
    } catch (actionError) {
      setError(actionError?.message || 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  if (parked) {
    return (
      <div className="judgment-park is-parked">
        <p className="judgment-park__state">You parked this. It is still yours; you are just not tending it.</p>
        <button type="button" onClick={() => run(onResume)} disabled={busy}>
          {busy ? 'Picking it up…' : 'Pick it back up'}
        </button>
        {error ? <p className="judgment-park__error" role="alert">{error}</p> : null}
      </div>
    );
  }

  if (!asking) {
    return (
      <div className="judgment-park">
        <button type="button" onClick={() => setAsking(true)}>Park this</button>
      </div>
    );
  }

  return (
    <div className="judgment-park is-asking">
      {/* This is the whole reason the edges are worth recording. Parking a
          claim does not change what rests on it, and saying nothing would let
          those quietly outlive their own foundation. It raises them; it does
          not touch them. */}
      {supports.length ? (
        <p className="judgment-park__supports">
          {supports.length === 1 ? 'One belief rests on this' : `${supports.length} beliefs rest on this`}
          {': '}
          {supports.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 ? '; ' : ''}
              <Link to={`/judgment/${item.id}`}>{item.claim}</Link>
            </React.Fragment>
          ))}
          . Parking this does not change them.
        </p>
      ) : null}
      <label htmlFor="judgment-lesson">What did holding this teach you?</label>
      <textarea
        id="judgment-lesson"
        rows={2}
        value={lesson}
        placeholder="One sentence. It outlives the claim."
        onChange={(event) => setLesson(event.target.value)}
      />
      <div className="judgment-park__actions">
        <button type="button" onClick={() => run(() => onPark(lesson))} disabled={busy}>
          {busy ? 'Parking…' : 'Park it'}
        </button>
        <button type="button" className="is-quiet" onClick={() => { setAsking(false); setLesson(''); }} disabled={busy}>
          Never mind
        </button>
      </div>
      {error ? <p className="judgment-park__error" role="alert">{error}</p> : null}
    </div>
  );
};

/*
 * What this rests on, and what rests on it.
 *
 * A list of claims is a list. A belief that depends on another belief is
 * structure, and it is the only part of this product that compounds — retiring
 * "compute is scarce" has to raise a question about "CoreWeave is undervalued",
 * or the second one quietly outlives its own foundation.
 *
 * The edge is never drawn for you and never inferred. You pick the claim, and
 * you say in your own words why one rests on the other, because an edge
 * without a reason is a graph nobody can read six months later.
 */
const Dependencies = ({ rests, supports, options, onAdd, onRemove }) => {
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError('');
    try {
      await onAdd(target, note);
      setAdding(false);
      setTarget('');
      setNote('');
    } catch (addError) {
      setError(addError?.message || 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="judgment__field judgment-depends" aria-labelledby="judgment-field-depends">
      <h2 id="judgment-field-depends">This rests on</h2>

      {rests.length ? (
        <ul className="judgment-depends__list">
          {rests.map(line => (
            <li key={line.id}>
              {line.claim
                ? <Link to={`/judgment/${line.pageId}`}>{line.claim}</Link>
                : <span className="judgment-depends__missing">A claim that is no longer here</span>}
              {line.note ? <p className="judgment-depends__note">{line.note}</p> : null}
              <button type="button" onClick={() => onRemove(line.id)}>Not any more</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="judgment-depends__empty">Nothing yet. A belief that stands on its own is fine.</p>
      )}

      {adding ? (
        <div className="judgment-depends__add">
          <label htmlFor="judgment-depends-target">Which belief does this rest on?</label>
          <select id="judgment-depends-target" value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Choose a claim</option>
            {options.map(option => (
              <option key={option.id} value={option.id}>{option.sentence}</option>
            ))}
          </select>
          <label htmlFor="judgment-depends-note">Why?</label>
          <input
            id="judgment-depends-note"
            value={note}
            placeholder="If that one goes, what happens to this one?"
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="judgment-depends__actions">
            <button type="button" onClick={add} disabled={busy || !target}>
              {busy ? 'Writing it down…' : 'It rests on that'}
            </button>
            <button type="button" className="is-quiet" onClick={() => setAdding(false)} disabled={busy}>Never mind</button>
          </div>
          {error ? <p className="judgment-depends__error" role="alert">{error}</p> : null}
        </div>
      ) : (
        <button type="button" className="judgment-depends__open" onClick={() => setAdding(true)}>
          Say what this rests on
        </button>
      )}

      {/* The other direction, which is the reason the first one is worth
          recording: these are what move if this claim does. */}
      {supports.length ? (
        <div className="judgment-depends__supports">
          <h3>What rests on this</h3>
          <ul>
            {supports.map(item => (
              <li key={item.id}>
                <Link to={`/judgment/${item.id}`}>{item.claim}</Link>
                {item.note ? <p className="judgment-depends__note">{item.note}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

const JudgmentDetail = ({ pageId }) => {
  const [page, setPage] = useState(null);
  const [overnight, setOvernight] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const claimRef = useRef(null);
  const flownFor = useRef('');
  const { ask, busy: asking, error: askError } = useAgentRail();
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // Reading what arrived overnight is a read. It must not touch the
        // morning paper's cursor, so this reads the source events directly
        // rather than opening the daily loop. It does not depend on the page
        // either, so it goes at the same time rather than after it — two round
        // trips in series is twice the wait on a cold API for no reason.
        const [loaded, events] = await Promise.all([
          getWikiPage(pageId),
          listWikiSourceEvents({ limit: SOURCE_EVENT_LIMIT }).catch(() => [])
        ]);
        if (cancelled) return;
        setPage(loaded);
        setOvernight(selectOvernightLine(loaded, events));
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not open this judgment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pageId]);

  const view = useMemo(() => (page ? projectJudgment(page) : null), [page]);

  /* A judgment lives behind a sign-in, which makes it hard to be held to. The
     pamphlet is the same four sections on one sheet, for handing to someone
     who is not going to make an account to read what you think. */
  const printPamphlet = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    setPrintError('');
    try {
      const blob = await downloadJudgmentPamphlet(pageId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(view?.claim || 'judgment').slice(0, 60).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'judgment'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (failure) {
      setPrintError(failure?.response?.data?.error || 'The pamphlet could not be built.');
    } finally {
      setPrinting(false);
    }
  }, [pageId, printing, view]);

  /* The claim arrived from somewhere — a wiki check-in, the index — as a
     sentence the human was already reading. It flies from where it was to
     where it belongs instead of appearing as a new headline. */
  useLayoutEffect(() => {
    if (!view?.claim || flownFor.current === view.claim) return;
    if (flySentenceInto(claimRef.current, view.claim)) flownFor.current = view.claim;
  }, [view?.claim]);

  /* The line settles into the field first: the human already decided, so the
     page should not make them watch a spinner to see their own decision. If the
     save fails the page goes back to what it said before, because a line that
     was not written down must not look written down. */
  const commit = useCallback(async (judgment) => {
    setPage(current => ({ ...current, judgment }));
    try {
      const saved = await updateWikiPage(pageId, { judgment });
      /* Trusting the response was a way to lose a line in silence. If what came
         back does not carry what was just written — an older API, a field the
         normalizer dropped — replacing the page with it made the line vanish
         with no error and nothing to read. A line that was not saved has to say
         so; the page keeps showing it until the human knows it did not land. */
      const savedCounts = countJudgmentLines(saved?.judgment);
      const sentCounts = countJudgmentLines(judgment);
      const dropped = JUDGMENT_LINE_FIELDS.some(field => savedCounts[field] < sentCounts[field]);
      if (dropped) throw new Error('That line was not saved. It is still only on this screen.');
      setPage(saved);
    } catch (saveError) {
      setPage(current => ({ ...current, judgment: page?.judgment }));
      throw saveError;
    }
  }, [page, pageId]);

  const writeAccepted = useCallback(
    (proposal, field) => commit(acceptProposalIntoJudgment(page, proposal, field)),
    [commit, page]
  );

  const fileEvidence = useCallback(
    (candidate, field) => commit(fileEvidenceIntoJudgment(page, candidate, field)),
    [commit, page]
  );

  const park = useCallback(lesson => commit(parkJudgment(page, lesson)), [commit, page]);
  const resume = useCallback(() => commit(resumeJudgment(page)), [commit, page]);

  /* The other claims, so a dependency can be chosen and named. This is the one
     thing on the page that needs to know the corpus exists; it loads after the
     claim so it never delays the reading of it. */
  const [corpus, setCorpus] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pages = await listWikiPages({ summary: 1, limit: 500 });
        if (!cancelled) setCorpus(Array.isArray(pages) ? pages : []);
      } catch (_corpusError) {
        /* The claim reads fine without the rest of the corpus. All that is
           lost is the ability to name what this rests on. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pagesById = useMemo(
    () => new Map(corpus.map(item => [String(item?._id || ''), item])),
    [corpus]
  );
  const rests = useMemo(
    () => dependencyLines(page?.judgment || {}, pagesById),
    [page, pagesById]
  );
  const supports = useMemo(() => restingOn(pageId, corpus), [pageId, corpus]);
  const dependencyOptions = useMemo(
    () => buildJudgmentIndex(corpus).filter(item => String(item.id) !== String(pageId)),
    [corpus, pageId]
  );
  const addDependsOn = useCallback(
    (target, note) => commit(addDependency({ ...page, _id: pageId }, target, note)),
    [commit, page, pageId]
  );
  const removeDependsOn = useCallback(
    dependencyId => commit(removeDependency(page, dependencyId)),
    [commit, page]
  );

  /* A line the human typed, into any of the four. The agent is not involved.
     The id is the line's, so typing more of the same sentence rewrites it
     rather than adding another. */
  const writeLine = useCallback(
    (text, field, lineId) => commit(upsertLineIntoJudgment(page, text, field, lineId)),
    [commit, page]
  );

  /* What the rail is looking at, and what it may do on this page's behalf.
     Asking happens there; this page only supplies the corpus and the write. */
  useAgentRailSurface(
    view?.claim
      ? {
        id: `judgment:${pageId}`,
        subject: view.claim,
        empty: 'Nothing to retrieve until you ask.'
      }
      : { id: `judgment:${pageId}`, subject: '', empty: 'Nothing to retrieve until you ask.' },
    {
      onAsk: async (question, options = {}) => {
        const answered = await askWikiPage(pageId, question);
        const discussions = Array.isArray(answered?.discussions) ? answered.discussions : [];
        const latest = discussions[discussions.length - 1];
        const sentence = oneSentence(docText(latest?.answer));
        if (!sentence) return null;
        /* Everything the ask came back with, not only the first line: the rail
           offers the rest under Another rather than presenting one retrieved
           sentence as though it were the answer. */
        const alternatives = (Array.isArray(latest?.alternatives) ? latest.alternatives : [])
          .map(item => ({
            sentence: oneSentence(docText(item?.answer) || item?.text || ''),
            source: answerProvenance(answered, item)
          }))
          .filter(item => item.sentence && item.sentence !== sentence)
          .slice(0, 4);
        return {
          id: `ask:${discussions.length}:${sentence.slice(0, 24)}`,
          sentence,
          body: sentence,
          source: answerProvenance(answered, latest),
          alternatives,
          origin: options.origin || '',
          fields: options.fields || ['why', 'against']
        };
      },
      onAccept: writeAccepted
    }
  );

  const acceptOvernight = useCallback(async (proposal, field) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setOvernight(null);
    try {
      await writeAccepted(proposal, field);
    } catch (saveError) {
      setError(saveError?.response?.data?.error || 'That line could not be saved. It has not been written down.');
      setOvernight(proposal);
    } finally {
      setBusy(false);
    }
  }, [busy, writeAccepted]);

  const arriving = useMemo(() => takeFirstPaint(`judgment:${pageId}`), [pageId]);
  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : 'judgment-return');

  if (loading) {
    return (
      <main className="judgment" aria-busy="true">
        <p className="judgment__nothing" role="status">Opening the claim…</p>
      </main>
    );
  }

  if (!view || !view.claim) {
    return (
      <main className="judgment">
        <Link className={`judgment__back ${step(1)}`} to="/judgment">← All judgments</Link>
        <p className={`judgment__nothing ${step(2)}`}>
          {error || 'There is no judgment on this page yet.'}
        </p>
      </main>
    );
  }

  return (
    <main className="judgment" aria-labelledby="judgment-claim">
      {overnight ? (
        <div className={step(1)}>
          <OvernightLine
            proposal={overnight}
            busy={busy}
            onAccept={acceptOvernight}
            onDismiss={() => setOvernight(null)}
          />
        </div>
      ) : null}

      <div className={`judgment__meta ${step(2)}`}>
        <Link className="judgment__back" to="/judgment">← All judgments</Link>
        <button type="button" className="judgment__print" onClick={printPamphlet} disabled={printing}>
          {printing ? 'Setting it…' : 'Print this as one page'}
        </button>
        {/* A belief held for life. Kept claims are never bubbled as neglected,
            because you cannot neglect something you decided to keep. */}
        <EvergreenToggle
          evergreen={view.evergreen}
          onChange={async (next) => {
            const saved = await setWikiPageEvergreen(pageId, next);
            setPage(current => ({ ...current, evergreen: saved?.evergreen ?? next, evergreenAt: saved?.evergreenAt ?? null }));
          }}
        />
      </div>
      {printError ? <p className="judgment__print-error" role="alert">{printError}</p> : null}

      <h1 className="judgment__claim" id="judgment-claim" ref={claimRef}>{view.claim}</h1>
      {view.provenance ? (
        <p className={`judgment__provenance ${step(3)}`}>{view.provenance}</p>
      ) : null}

      <div className={`judgment__fields ${step(4)}`}>
        <Field
          label="Why"
          lines={view.why}
          sources={view.whySources}
          prompt="Why do you believe it?"
          field="why"
          onWrite={(text, lineId) => writeLine(text, 'why', lineId)}
        />
        <Field
          label="Against"
          lines={view.against}
          sources={view.againstSources}
          prompt="What argues against it?"
          field="against"
          onWrite={(text, lineId) => writeLine(text, 'against', lineId)}
        />
        <LibraryEvidence pageId={pageId} onFile={fileEvidence} />
        <Field
          label="I&rsquo;d change my mind if"
          lines={view.changeMindIf}
          prompt="What would change your mind?"
          field="changeMindIf"
          onWrite={(text, lineId) => writeLine(text, 'changeMindIf', lineId)}
        />
        <Field
          label="What I did"
          lines={view.whatIDid}
          prompt="What did you do about it?"
          field="whatIDid"
          onWrite={(text, lineId) => writeLine(text, 'whatIDid', lineId)}
        >
          {view.whatIDid.length ? (
            <p className="judgment__ledger-note">
              {formatLedgerDate(view.whatIDid[view.whatIDid.length - 1].at)
                ? `${formatLedgerDate(view.whatIDid[view.whatIDid.length - 1].at)} — this line doesn’t get edited, only added to.`
                : 'This line doesn’t get edited, only added to.'}
            </p>
          ) : null}
        </Field>

        {/* What holding this taught you. It sits with the claim while the
            claim is alive, and it is the thing that outlives it. */}
        {view.lessons.length ? (
          <section className="judgment__field judgment__lessons" aria-labelledby="judgment-field-lessons">
            <h2 id="judgment-field-lessons">What it taught me</h2>
            <ul>
              {view.lessons.map(lesson => (
                <li key={lesson.id}>
                  <span>{lesson.text}</span>
                  {formatLedgerDate(lesson.at) ? <small>{formatLedgerDate(lesson.at)}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Dependencies
          rests={rests}
          supports={supports}
          options={dependencyOptions}
          onAdd={addDependsOn}
          onRemove={removeDependsOn}
        />

        <ParkJudgment parked={view.parked} supports={supports} onPark={park} onResume={resume} />

        {/* The review is absent until the date. Then it arrives and asks one
            question; the answer is the human's, never the agents'. */}
        {view.review ? (
          <section className="judgment__field judgment__review" aria-labelledby="judgment-field-review">
            <h2 id="judgment-field-review">What happened?</h2>
            {view.review.state === 'observed' ? (
              <>
                {view.review.summary ? <p className="judgment__line">{view.review.summary}</p> : null}
                {view.review.lesson ? <p className="judgment__line">{view.review.lesson}</p> : null}
              </>
            ) : (
              <p className="judgment__line judgment__line--asking">
                The review date has passed. Nothing here is filled in until you say what happened.
              </p>
            )}
          </section>
        ) : null}
      </div>

      {/* The only other agent door. The retrieve runs in the rail; the column
          changes only if the human accepts what comes back.
          The door says so itself, because the answer arrives in the rail and a
          button that looks unchanged after a click reads as a broken one. */}
      <div className={`judgment__door ${step(5)}`}>
        <button
          type="button"
          className="judgment__door-link"
          disabled={asking}
          onClick={() => ask?.(COUNTER_QUESTION, { fields: ['against'], origin: 'Asked of this claim' })}
        >
          {asking ? 'Looking through your library…' : 'Find something that argues against this'}
        </button>
        {asking ? (
          <p className="judgment__door-note" role="status">Whatever comes back appears in the margin. Nothing is written until you accept it.</p>
        ) : null}
        {!asking && askError ? (
          <p className="judgment__door-note judgment__door-note--error" role="alert">{askError}</p>
        ) : null}
      </div>

      {error ? <p className="judgment__error" role="alert">{error}</p> : null}
    </main>
  );
};

const Judgment = () => {
  const { pageId = '' } = useParams();
  const [items, setItems] = useState([]);
  const [articles, setArticles] = useState([]);
  const [readingUnreadable, setReadingUnreadable] = useState(false);
  const [indexError, setIndexError] = useState('');

  useEffect(() => {
    document.body.classList.add('judgment-route');
    return () => document.body.classList.remove('judgment-route');
  }, []);

  useEffect(() => {
    if (pageId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        /* The index renders one sentence and a provenance line per judgment.
           Asking for whole pages meant every Tiptap body, every plainText, and
           every source and claim ledger in the corpus came down the wire so
           that almost all of them could be filtered out on arrival.

           Source events come alongside rather than after: they say which
           claims have had evidence arrive that nobody has read, and that is
           the only thing this list is allowed to raise its voice about. */
        const [pages, events] = await Promise.all([
          listWikiPages({ summary: 1, limit: 500 }),
          listWikiSourceEvents({ limit: 200 }).catch(() => [])
        ]);
        if (!cancelled) setItems(buildJudgmentIndex(pages, events));
        /* The reading behind the drift, asked for after the claims have
           arrived: the drawing is the slowest thing on the page and must not
           be the reason the fastest thing waits. */
        try {
          const read = await getArticles();
          if (!cancelled) {
            setArticles(Array.isArray(read) ? read : []);
            setReadingUnreadable(false);
          }
        } catch (_readingError) {
          /* Say the server fell over. Swallowing this reported an outage as
             "you have not filed anything", which is the software blaming the
             reader for its own failure. */
          if (!cancelled) setReadingUnreadable(true);
        }
      } catch (error) {
        if (!cancelled) setIndexError('Could not load your judgments.');
      }
    })();
    return () => { cancelled = true; };
  }, [pageId]);

  return (
    <>
      {/* The lock draws nothing behind the claim. A constellation drifting
          past a judgment is decoration on the one page in the product that
          should carry none. */}
      {pageId
        ? <JudgmentDetail pageId={pageId} />
        : (
          <>
            <JudgmentIndex items={items} articles={articles} readingUnreadable={readingUnreadable} />
            {indexError ? <p className="judgment__error" role="alert">{indexError}</p> : null}
          </>
        )}
    </>
  );
};

export default Judgment;
