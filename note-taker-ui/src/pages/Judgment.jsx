import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createWikiPage,
  downloadJudgmentPamphlet,
  getCompanyDossierJudgmentReview,
  getJudgmentChangeProposal,
  getJudgmentLibraryEvidence,
  getWikiPage,
  setWikiPageEvergreen,
  listCompanyDossierJudgmentReviews,
  listWikiPages,
  listWikiSourceEvents,
  proposeJudgmentChange,
  resolveCompanyDossierJudgmentReview,
  resolveJudgmentChange,
  updateWikiPage
} from '../api/wiki';
import { getArticles } from '../api/articles';
import { recordClaimFalsifiability } from '../api/dailyLoop';
import { useNoeisAgentSurface } from '../agent/AgentRailContext';
import EvergreenToggle from '../components/EvergreenToggle';
import ReadingDrift from '../components/ReadingDrift';
import JudgmentShelf from '../components/collection/JudgmentShelf';
import AriadneThread from '../components/judgment/AriadneThread';
import DossierResearchReview from '../components/judgment/DossierResearchReview';
import JudgmentLedger from '../components/judgment/JudgmentLedger';
import JudgmentResolution from '../components/judgment/JudgmentResolution';
import { flySentenceInto, handOffSentence, takeFirstPaint, ENTER_DURATION_MS, prefersReducedMotion } from '../motion/columnMotion';
import { usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import { useSystemStatusControls } from '../system/SystemStatusContext';
import {
  acceptProposalIntoJudgment,
  addDependency,
  dependencyLines,
  dismissOvernightLine,
  fileEvidenceIntoJudgment,
  parkJudgment,
  removeDependency,
  restingOn,
  resumeJudgment,
  buildJudgmentIndex,
  createJudgment,
  formatHoldAge,
  oneSentence,
  PARTNER_ACK,
  projectJudgment,
  selectOvernightLine,
  verdictEvidenceOptions,
  upsertLineIntoJudgment
} from './judgmentModel';
import { rememberOpenedJudgment } from '../components/reader/folioModel';
import { UpdateComposer, JudgmentLog, KindWords } from './JudgmentThread';
import ClaimFalsifiabilityPrompt from '../components/wiki/ClaimFalsifiabilityPrompt';
import { OpinionGhost, ghostOfMissingName } from './opinionGhost';
import { buildJudgmentSurfaceDescriptor } from './judgmentSurfaceModel';
import '../styles/wiki-front-page.css';
import '../styles/judgment.css';

// Judgment.
//
// One claim, and a log of how it is held. The prior does not grow: the name,
// the sentence, and what would change your mind. Everything else — why,
// against, what you did — is a newest-first line in the case. Agents retrieve;
// the human accepts. Nothing an agent brings back is written down until a
// person says so.
//
// The retrieving happens in the rail, which is not part of this page — it was
// already on screen before this column arrived and it will still be there after
// the column changes. This page only tells it what it is looking at.

/* What a save has to come back holding. Read off the stored contract rather
   than the projection, because this is checking what the server kept. */
const JUDGMENT_LINE_FIELDS = ['why', 'against', 'falsifiers', 'decisions'];
const countJudgmentLines = (judgment = {}) => JUDGMENT_LINE_FIELDS.reduce((counts, field) => ({
  ...counts,
  [field]: Array.isArray(judgment?.[field]) ? judgment[field].length : 0
}), {});
const SOURCE_EVENT_LIMIT = 40;
const AUTOSAVE_PAUSE_MS = 700;
const LIBRARY_PREFETCH_BUSY_MS = 1200;
const asLine = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const markPendingDossierResearch = (items = [], reviews = []) => {
  const pendingPageIds = new Set(
    (Array.isArray(reviews) ? reviews : [])
      .filter(review => review?.status === 'awaiting_review')
      .map(review => String(review?.provenance?.pageId || ''))
      .filter(Boolean)
  );
  if (!pendingPageIds.size) return items;
  return items.map(item => (
    pendingPageIds.has(String(item.id)) ? { ...item, pendingDossierResearch: true } : item
  ));
};

/* A line that writes itself after a pause, and refuses to be empty.
   In-flight saves must not clobber the draft while the field still has focus —
   a slow round-trip is not a reason to throw away the next keystroke. */
const AutosaveField = ({ value = '', format, multiline = false, onSave, onIdle, resetAfterSave = false, className, ...inputProps }) => {
  const stored = format(value);
  const [draft, setDraft] = useState(stored);
  const timerRef = useRef(0);
  const editingRef = useRef(false);
  const fieldRef = useRef(null);

  useEffect(() => {
    if (editingRef.current) return;
    setDraft(stored);
  }, [stored]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useLayoutEffect(() => {
    if (!multiline || !fieldRef.current) return;
    fieldRef.current.style.height = 'auto';
    fieldRef.current.style.height = `${fieldRef.current.scrollHeight}px`;
  }, [draft, multiline]);

  const save = useCallback(async (raw) => {
    const next = format(raw);
    if (!next) {
      setDraft(stored);
      return;
    }
    if (next === stored || !onSave) return;
    await onSave(next);
  }, [format, onSave, stored]);

  const Field = multiline ? 'textarea' : 'input';

  return (
    <Field
      {...inputProps}
      ref={fieldRef}
      className={className}
      autoComplete="off"
      {...(multiline ? { rows: 1 } : {})}
      value={draft}
      onFocus={() => { editingRef.current = true; }}
      onChange={(event) => {
        setDraft(event.target.value);
        window.clearTimeout(timerRef.current);
        if (!resetAfterSave && format(event.target.value)) {
          timerRef.current = window.setTimeout(() => save(event.target.value), AUTOSAVE_PAUSE_MS);
        }
      }}
      onBlur={() => {
        editingRef.current = false;
        window.clearTimeout(timerRef.current);
        if (resetAfterSave) setDraft(stored);
        Promise.resolve(save(draft)).finally(() => onIdle?.());
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
    />
  );
};

/* Two altitudes: the name, then the opinion. The name is the wiki page's
   title when it is actually a name; until then the field stays empty. The
   sentence of belief always sits under it. Editing the title writes the wiki
   handle the rest of the product already uses. Editing the opinion writes
   the claim, and only the claim. */
const Title = ({ title = '', claim = '', pageId = '', onSave, onWriteClaim, titleRef }) => {
  const [writeError, setWriteError] = useState('');

  const run = useCallback(async (action, fallback) => {
    setWriteError('');
    try {
      await action();
    } catch (failure) {
      setWriteError(
        failure?.response?.data?.error
        || failure?.message
        || fallback
      );
    }
  }, []);

  return (
    <>
      <div className="judgment__claim" ref={titleRef}>
        <h1 className="sr-only" id="judgment-claim">{claim}</h1>
        <AutosaveField
          id="judgment-title"
          className="judgment__title"
          aria-label="Title"
          multiline
          placeholder={ghostOfMissingName(title) || undefined}
          value={title}
          format={asLine}
          onSave={(next) => run(() => onSave?.(next), 'That name could not be saved.')}
        />
        <AutosaveField
          id="judgment-opinion"
          className="judgment__opinion"
          aria-label="What you hold"
          multiline
          value={claim}
          format={oneSentence}
          onSave={(next) => run(() => onWriteClaim?.(next), 'That judgment could not be saved.')}
          resetAfterSave
        />
        <OpinionGhost sentence={claim} identity={pageId} />
      </div>
      {writeError ? <p className="judgment__error" role="alert">{writeError}</p> : null}
    </>
  );
};

const BeliefLink = ({ to, title, claim }) => (
  <>
    <Link to={to}>{title || claim}</Link>
    {title && claim ? <p className="judgment-depends__claim">{claim}</p> : null}
  </>
);

/* A note under the door: one sentence on the threshold of the claim, then
   two words. Accept resolves in place into Why or Against; dismiss evaporates
   it. Not a tray, not a toast. */
const OvernightLine = ({ proposal, busy, onAccept, onDismiss, onHint }) => {
  const [choosing, setChoosing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const reduced = usePrefersReducedMotion();

  const leave = (run) => {
    onHint?.('');
    setLeaving(true);
    window.setTimeout(run, reduced ? 0 : 200);
  };

  return (
    <div
      className={`judgment-slip judgment__proposal${leaving ? ' is-leaving' : ''}`}
      role="group"
      aria-label="Overnight agent line"
    >
      <p className="judgment__proposal-sentence">{proposal.sentence}</p>
      {choosing ? (
        <KindWords
          disabled={busy}
          onHint={onHint}
          onChoose={(field) => leave(() => onAccept(proposal, field))}
        />
      ) : (
        <span className="judgment__proposal-actions">
          <button type="button" disabled={busy} onClick={() => setChoosing(true)}>Accept</button>
          <button type="button" disabled={busy} onClick={() => leave(() => onDismiss(proposal))}>Dismiss</button>
        </span>
      )}
    </div>
  );
};

const JudgmentChangeReview = ({ proposal, busy = false, error = '', onResolve, sentenceRef }) => {
  if (!proposal?.id) return null;
  const status = asLine(proposal.status).toLowerCase();
  const before = asLine(proposal.provenance?.before);
  const after = asLine(proposal.provenance?.after);
  const pending = status === 'pending';
  const label = {
    accepted: 'Accepted',
    preserved: 'Preserved',
    rejected: 'Rejected',
    deferred: 'Deferred'
  }[status] || 'Proposed';

  return (
    <section className={`judgment-change${pending ? ' is-pending' : ' is-settled'}`} aria-label="Judgment change review">
      <p className="judgment-change__eyebrow">{pending ? 'Before this becomes what you hold' : label}</p>
      {before ? <p className="judgment-change__before">{before}</p> : null}
      {after ? <p className="judgment-change__after" ref={sentenceRef}>{after}</p> : null}
      {pending ? (
        <div className="judgment-change__actions" aria-label="Resolve proposed judgment change">
          <button type="button" disabled={busy} onClick={() => onResolve('accept')}>Accept</button>
          <button type="button" disabled={busy} onClick={() => onResolve('preserve')}>Preserve</button>
          <button type="button" disabled={busy} onClick={() => onResolve('reject')}>Reject</button>
          <button type="button" disabled={busy} onClick={() => onResolve('defer')}>Defer</button>
        </div>
      ) : (
        <p className="judgment-change__receipt">Receipt bound to the exact before and after sentences.</p>
      )}
      {error ? <p className="judgment-change__error" role="alert">{error}</p> : null}
    </section>
  );
};

const JudgmentIndex = ({ items, articles, loading, readingLoading, readingUnreadable, onHeld }) => {
  const arriving = useMemo(() => takeFirstPaint('judgment-index'), []);
  const enter = arriving ? 'wfp-anim wfp-anim--2' : 'judgment-return';

  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [arrivingId, setArrivingId] = useState('');
  const [arrivingSentence, setArrivingSentence] = useState('');
  const [partnerNote, setPartnerNote] = useState('');
  const [forwardId, setForwardId] = useState('');
  const inputRef = useRef(null);
  const rowRefs = useRef(new Map());
  const pendingClearRef = useRef(0);

  useEffect(() => () => window.clearTimeout(pendingClearRef.current), []);

  useLayoutEffect(() => {
    if (!arrivingId || !arrivingSentence) return undefined;
    const node = rowRefs.current.get(arrivingId);
    const flown = node ? flySentenceInto(node, arrivingSentence) : false;
    const wait = prefersReducedMotion() || !flown ? 0 : ENTER_DURATION_MS;
    pendingClearRef.current = window.setTimeout(() => {
      setDraft('');
      setCreating(false);
    }, wait);
    return undefined;
  }, [arrivingId, arrivingSentence]);

  /* The claim is the page. A judgment is a wiki page carrying a judgment
     contract, so writing one down creates that page and puts the sentence in
     it. The sentence lifts into the casebook; the input lets go after it lands. */
  const submitClaim = useCallback(async (event) => {
    event?.preventDefault?.();
    const sentence = oneSentence(draft);
    if (!sentence || creating) return;
    setCreating(true);
    setCreateError('');
    setPartnerNote('');
    setForwardId('');
    try {
      const held = await createJudgment(sentence, {
        createPage: createWikiPage,
        updatePage: updateWikiPage
      });
      const item = {
        id: held.id,
        title: '',
        headline: sentence,
        sentence,
        provenance: '',
        state: 'quiet',
        note: '',
        heldMark: held.reused
          ? `You already hold this — ${formatHoldAge(held.heldDays)}.`
          : 'held · today',
        evergreen: false,
        lessons: [],
        pendingDossierResearch: false
      };
      onHeld?.(item);
      if (held.reused) {
        setForwardId(held.id);
        const wait = prefersReducedMotion() ? 0 : ENTER_DURATION_MS;
        pendingClearRef.current = window.setTimeout(() => {
          setDraft('');
          setCreating(false);
        }, wait);
        return;
      }
      const origin = inputRef.current;
      if (origin) handOffSentence(sentence, origin);
      setArrivingSentence(sentence);
      setArrivingId(held.id);
      setPartnerNote(PARTNER_ACK);
    } catch (error) {
      setCreateError(error?.message || 'The judgment could not be created.');
      setCreating(false);
    }
  }, [creating, draft, onHeld]);

  // The index is a title column, not a thing to interrogate. The rail
  // stays where it is and waits for one of them to be opened.
  useNoeisAgentSurface('agent-surface.judgment', buildJudgmentSurfaceDescriptor(), {
    subject: 'Your judgments.'
  }, {});

  return (
    <main className="judgment judgment--index" aria-labelledby="judgment-index-title">
      <h1 className="sr-only" id="judgment-index-title">All judgments</h1>
      {/* Where the reading has been going, above the beliefs it produced. It
          is the one thing in the product that asks nothing of you, and it
          belongs at the top of the room that asks the most: this is the
          weather over the claims, not another claim. */}
      <ReadingDrift articles={articles} loading={readingLoading} unreadable={readingUnreadable} />
      {/* One prompt. The verb is hold a sentence — not a company case, not
          a door back to this morning's paper. The sentence you type is the
          claim. Company research still lives on Wiki for people who already
          keep dossiers; it is not a peer of this field. */}
      <form
        className={`judgment__new ${enter}${!items.length && !loading ? ' is-alone' : ''}`}
        onSubmit={submitClaim}
      >
        <label htmlFor="judgment-new-claim">Hold a sentence</label>
        <input
          id="judgment-new-claim"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="One sentence you think is true."
          disabled={creating}
        />
        <div className="judgment__new-actions">
          <button type="submit" disabled={creating || !draft.trim()}>
            {creating ? 'Holding it…' : 'Hold it'}
          </button>
          {createError ? <span role="alert">{createError}</span> : null}
        </div>
        {partnerNote ? (
          <p className="judgment__partner-note" role="status">{partnerNote}</p>
        ) : null}
      </form>
      {items.length ? (
        <>
          <ul className={`judgment__index ${enter}`}>
            {items.map(item => (
              <li
                key={item.id}
                data-state={item.state}
                className={forwardId === item.id ? 'is-forward' : ''}
              >
                <Link
                  to={`/judgment/${item.id}`}
                  ref={(node) => {
                    if (node) rowRefs.current.set(item.id, node);
                    else rowRefs.current.delete(item.id);
                  }}
                  onClick={(event) => handOffSentence(item.headline, event.currentTarget)}
                >
                  {item.headline}
                </Link>
                {/* The claim stays, quieter, once the case has a name of its
                    own. A title that is still the claim is not repeated. */}
                {item.title ? <p className="judgment__index-claim">{item.sentence}</p> : null}
                {item.heldMark ? (
                  <span className="judgment__index-birth">{item.heldMark}</span>
                ) : null}
                {item.note ? <span className="judgment__index-note">{item.note}</span> : null}
                {item.pendingDossierResearch ? (
                  <span className="judgment__index-note judgment__index-research-review">
                    Accepted research to review
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
            <Link to="/judgment/mirror">The Mirror →</Link>
          </p>
        </>
      ) : loading ? (
        /* The form is already the empty state. For the seconds this takes,
           an index that has not arrived is indistinguishable from an index
           that is empty, and telling a reader with a dozen claims that they
           have none is the software describing its own latency as a fact
           about them. */
        <p className="judgment__quiet" role="status">Reading back what you hold…</p>
      ) : null}
    </main>
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
              <Link to={`/judgment/${item.id}`}>{item.headline || item.claim}</Link>
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
              {line.headline
                ? <BeliefLink to={`/judgment/${line.pageId}`} title={line.title} claim={line.claim} />
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
              <option key={option.id} value={option.id}>{option.headline || option.sentence}</option>
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
                <BeliefLink to={`/judgment/${item.id}`} title={item.title} claim={item.claim} />
                {item.note ? <p className="judgment-depends__note">{item.note}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

const JudgmentDetail = ({ pageId, initialPage = null }) => {
  // The casebook index already carries the full human judgment contract. Use
  // that narrow row as the first readable frame, then refresh the full reader
  // document behind it. Opening a belief should never wait on body prose the
  // case page does not render.
  const [page, setPage] = useState(initialPage);
  const [overnight, setOvernight] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initialPage);
  const claimRef = useRef(null);
  const changeSentenceRef = useRef(null);
  const flownFor = useRef('');
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [arrivingId, setArrivingId] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [libraryCandidates, setLibraryCandidates] = useState([]);
  const [kin, setKin] = useState(null);
  const [kindHint, setKindHint] = useState('');
  const [researchReview, setResearchReview] = useState(null);
  const [researchReviewBusy, setResearchReviewBusy] = useState(false);
  const [researchReviewError, setResearchReviewError] = useState('');
  const [changeProposal, setChangeProposal] = useState(null);
  const [changeProposalBusy, setChangeProposalBusy] = useState(false);
  const [changeProposalError, setChangeProposalError] = useState('');
  const [acceptedChangeTrace, setAcceptedChangeTrace] = useState(0);
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const systemStatus = useSystemStatusControls();
  const pageRef = useRef(page);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    if (pageId) rememberOpenedJudgment(pageId);
  }, [pageId]);

  useEffect(() => {
    if (!arrivingId) return undefined;
    const timer = window.setTimeout(() => setArrivingId(''), 800);
    return () => window.clearTimeout(timer);
  }, [arrivingId]);

  useEffect(() => {
    if (!initialPage || String(initialPage?._id || '') !== String(pageId)) return;
    setPage(current => (
      String(current?._id || '') === String(pageId) ? current : initialPage
    ));
    setLoading(false);
  }, [initialPage, pageId]);

  useEffect(() => {
    let cancelled = false;
    if (!initialPage) setLoading(true);
    (async () => {
      try {
        // Reading what arrived overnight is a read. It must not touch the
        // morning paper's cursor, so this reads the source events directly
        // rather than opening the daily loop. It does not depend on the page
        // either, so it goes at the same time rather than after it — two round
        // trips in series is twice the wait on a cold API for no reason.
        const [loaded, events, reviewResult, changeResult] = await Promise.all([
          getWikiPage(pageId, { reader: 1 }),
          listWikiSourceEvents({ limit: SOURCE_EVENT_LIMIT }).catch(() => []),
          Promise.resolve()
            .then(() => getCompanyDossierJudgmentReview(pageId))
            .then(review => ({ review }))
            .catch(reviewError => ({ reviewError })),
          Promise.resolve()
            .then(() => getJudgmentChangeProposal(pageId))
            .then(proposal => ({ proposal }))
            .catch(changeError => ({ changeError }))
        ]);
        if (cancelled) return;
        setPage(loaded);
        setOvernight(selectOvernightLine(loaded, events));
        setResearchReview(reviewResult.review || null);
        setResearchReviewError(reviewResult.reviewError
          ? 'The accepted-research review could not be loaded. Your judgment was not changed.'
          : '');
        setChangeProposal(changeResult.proposal || null);
        setChangeProposalError(changeResult.changeError
          ? 'The latest judgment-change receipt could not be loaded. What you hold was not changed.'
          : '');
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not open this judgment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialPage, pageId]);

  /* Library evidence is supporting context, never a release gate. Quiet
     mornings stay silent. The topbar speaks only if the read runs long or
     fails — not a toast, and not an alarm on the case.
     The inbox is for this sentence. When the hold is revised and saved,
     libraryAttempt advances so this read runs again; stale passages for
     the previous hold must not sit here. */
  useEffect(() => {
    let cancelled = false;
    let announced = false;
    setLibraryCandidates([]);

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      announced = true;
      systemStatus.setBackgroundWork({
        label: 'Looking in your library',
        stage: 'Reading what you already saved'
      });
    }, LIBRARY_PREFETCH_BUSY_MS);

    const settle = () => {
      window.clearTimeout(timer);
      if (announced) systemStatus.setBackgroundWork(null);
    };

    Promise.resolve()
      .then(() => getJudgmentLibraryEvidence(pageId))
      .then((found) => {
        if (cancelled) return;
        settle();
        setLibraryCandidates(Array.isArray(found?.candidates) ? found.candidates : []);
      })
      .catch(() => {
        if (cancelled) return;
        settle();
        setLibraryCandidates([]);
        systemStatus.setRecoverableFailure({
          stage: 'Library evidence',
          message: 'Your library could not be read for this claim.',
          retryable: true,
          retry: () => {
            systemStatus.clearRecoverableFailure();
            setLibraryAttempt(current => current + 1);
          }
        });
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (announced) systemStatus.setBackgroundWork(null);
    };
  }, [pageId, libraryAttempt, systemStatus]);

  const view = useMemo(() => (page ? projectJudgment(page) : null), [page]);
  /* The API is the single selection boundary. Every client sees the same
     eligibility gate, quality bar, and honest silence. */
  const inbox = libraryCandidates;

  /* The claim remains the dominant object. Decisions, observed outcomes,
     lessons, and the accepted revision that grounded the latest decision are
     carried as exact related identities rather than promoted into competing
     dashboards or guessed from their prose. */
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

  /* The title arrived from somewhere — the index, the shelf — as the name
     already on the page. It flies from where it was to where it belongs
     instead of appearing as a new headline. The claim stays the sentence. */
  useLayoutEffect(() => {
    if (!view?.headline || flownFor.current === view.headline) return;
    if (flySentenceInto(claimRef.current, view.headline)) flownFor.current = view.headline;
  }, [view?.headline]);

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
    async (proposal, field) => {
      await commit(acceptProposalIntoJudgment(page, proposal, field));
      if (field === 'criteria') {
        const text = String(proposal?.body || proposal?.sentence || '').trim();
        if (text) {
          await recordClaimFalsifiability({
            pageId,
            claimId: view?.claimId || '',
            resolutionCriteria: text
          });
        }
      }
    },
    [commit, page, pageId, view?.claimId]
  );

  const fileEvidence = useCallback(
    async (candidate, field) => {
      const judgment = fileEvidenceIntoJudgment(page, candidate, field);
      const target = field === 'against' ? 'against' : 'why';
      const last = (judgment[target] || []).at(-1);
      if (last?.reasonId) setArrivingId(last.reasonId);
      try {
        await commit(judgment);
      } catch (failure) {
        setArrivingId('');
        throw failure;
      }
    },
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
        const pages = await listWikiPages({ projection: 'judgment', limit: 500 });
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
  const persistCriteria = useCallback(async ({ resolutionCriteria, horizon }) => {
    await recordClaimFalsifiability({
      pageId,
      claimId: view?.claimId || '',
      resolutionCriteria,
      horizon
    });
  }, [pageId, view?.claimId]);

  const writeLine = useCallback(
    async (text, field, lineId) => {
      await commit(upsertLineIntoJudgment(page, text, field, lineId));
      if (field === 'changeMindIf' && text) {
        await persistCriteria({ resolutionCriteria: text });
      }
    },
    [commit, page, persistCriteria]
  );

  /* The name is the wiki page's title, not a judgment field. Renaming it
     does not rewrite the claim, so the case can join the wiki hierarchy
     without changing what is believed. */
  const rename = useCallback(async (nextTitle) => {
    const title = asLine(nextTitle);
    if (!title) return;
    const previous = page?.title;
    setPage(current => ({ ...current, title }));
    try {
      const saved = await updateWikiPage(pageId, { title });
      if (saved && typeof saved === 'object') {
        setPage(current => ({ ...current, ...saved, title: saved.title || title }));
      }
    } catch (saveError) {
      setPage(current => ({ ...current, title: previous }));
      throw saveError;
    }
  }, [page, pageId]);

  const resolveResearchReview = useCallback(async (resolution) => {
    if (!researchReview?.id || researchReviewBusy) return null;
    setResearchReviewBusy(true);
    setResearchReviewError('');
    try {
      const resolved = await resolveCompanyDossierJudgmentReview(pageId, researchReview.id, resolution);
      setResearchReview(resolved?.status === 'awaiting_review' ? resolved : null);
      return resolved;
    } catch (reviewError) {
      setResearchReviewError(
        reviewError?.response?.data?.error
        || reviewError?.message
        || 'The research review could not be resolved.'
      );
      return null;
    } finally {
      setResearchReviewBusy(false);
    }
  }, [pageId, researchReview, researchReviewBusy]);

  /* Editing the opinion creates a proposal, not accepted knowledge. The field
     returns to the sentence currently held; the exact before/after pair stays
     visible until the human resolves it. */
  const writeClaim = useCallback(async (sentence) => {
    const next = oneSentence(sentence);
    if (!next) return;
    const current = pageRef.current;
    if (next === oneSentence(current?.judgment?.currentJudgment)) return;
    setChangeProposalError('');
    const proposal = await proposeJudgmentChange(pageId, next);
    setChangeProposal(proposal);
  }, [pageId]);

  const resolveChangeProposal = useCallback(async (action) => {
    if (!changeProposal?.id || changeProposalBusy) return;
    setChangeProposalBusy(true);
    setChangeProposalError('');
    try {
      const resolved = await resolveJudgmentChange(pageId, changeProposal.id, action);
      if (resolved.page) {
        pageRef.current = resolved.page;
        setPage(resolved.page);
      }
      setChangeProposal(resolved.proposal || null);
      if (action === 'accept') {
        // Only a confirmed accepted write earns the thread. The receipt is the
        // proof; this counter simply lets the next paint show where it landed.
        setAcceptedChangeTrace(currentTrace => currentTrace + 1);
        setLibraryCandidates([]);
        setLibraryAttempt(currentAttempt => currentAttempt + 1);
        const prior = oneSentence(researchReview?.provenance?.judgmentAtAcceptance || '');
        const accepted = oneSentence(resolved.page?.judgment?.currentJudgment || '');
        if (researchReview?.status === 'awaiting_review' && accepted && accepted !== prior) {
          await resolveResearchReview('revised');
        }
      }
    } catch (changeError) {
      setChangeProposalError(
        changeError?.response?.data?.error
        || changeError?.message
        || 'The proposed change could not be resolved. What you hold was not changed.'
      );
    } finally {
      setChangeProposalBusy(false);
    }
  }, [changeProposal, changeProposalBusy, pageId, researchReview, resolveResearchReview]);

  /* What the rail is looking at, and what it may do on this page's behalf.
     Asking happens there; this page only supplies the corpus and the write. */
  useNoeisAgentSurface(
    'agent-surface.judgment',
    buildJudgmentSurfaceDescriptor({ page, pageId }),
    view?.claim
      ? {
        subject: view.claim,
        empty: 'Nothing to retrieve until you ask.'
      }
      : {
        subject: '',
        empty: 'Nothing to retrieve until you ask.'
    },
    {
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

  const dismissOvernight = useCallback(async (proposal) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setOvernight(null);
    try {
      await commit(dismissOvernightLine(page, proposal?.id));
    } catch (saveError) {
      setError(saveError?.response?.data?.error || 'That line could not be dismissed. It will still be here in the morning.');
      setOvernight(proposal);
    } finally {
      setBusy(false);
    }
  }, [busy, commit, page]);

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
      <div className={`judgment__meta ${step(1)}`}>
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

      {overnight ? (
        <div className={step(2)}>
          <OvernightLine
            proposal={overnight}
            busy={busy}
            onAccept={acceptOvernight}
            onDismiss={dismissOvernight}
            onHint={setKindHint}
          />
        </div>
      ) : null}

      <Title
        key={pageId}
        pageId={pageId}
        title={view.title}
        claim={view.claim}
        onSave={rename}
        onWriteClaim={writeClaim}
        titleRef={claimRef}
      />
      {view.provenance ? (
        <p className={`judgment__provenance ${step(3)}`}>{view.provenance}</p>
      ) : null}

      <JudgmentChangeReview
        proposal={changeProposal}
        busy={changeProposalBusy}
        error={changeProposalError}
        onResolve={resolveChangeProposal}
        sentenceRef={changeSentenceRef}
      />
      <AriadneThread
        traceId={acceptedChangeTrace}
        sourceRef={changeSentenceRef}
        targetRef={claimRef}
      />

      <DossierResearchReview
        pageId={pageId}
        review={researchReview}
        busy={researchReviewBusy}
        error={researchReviewError}
        onKeep={() => resolveResearchReview('kept')}
        onRevise={() => document.getElementById('judgment-opinion')?.focus()}
      />
      {!researchReview && researchReviewError ? (
        <p className="judgment-research-review__error" role="alert">{researchReviewError}</p>
      ) : null}

      {view.changeMindIf.length ? (
        <p className={`judgment__falsifier ${step(3)}`}>
          <span>I’d change my mind if</span>
          {view.changeMindIf.map(line => (
            <span key={line.id} className={line.id === arrivingId ? 'is-arriving' : ''}>
              {line.text}
            </span>
          ))}
        </p>
      ) : null}

      <div className={step(3)}>
        <ClaimFalsifiabilityPrompt
          criteria={view.resolutionCriteria || ''}
          horizon={view.horizon || ''}
          onKeep={persistCriteria}
        />
      </div>
      <JudgmentResolution
        pageId={pageId}
        claim={view.claim}
        judgment={page.judgment}
        evidenceOptions={verdictEvidenceOptions(page)}
        onSaved={(next) => {
          if (next) setPage(current => ({ ...current, judgment: next }));
        }}
      />
      <JudgmentLedger
        pageId={pageId}
        claim={view.claim}
        page={page}
        judgment={page.judgment}
        onSaved={(next) => {
          if (next) setPage(current => ({ ...current, judgment: next }));
        }}
      />

      <div className={step(4)}>
        <UpdateComposer
          key={pageId}
          onWrite={writeLine}
          onPending={setPendingId}
          onSettle={setArrivingId}
          inbox={inbox}
          onFile={fileEvidence}
          view={view}
          kin={kin}
          onKin={setKin}
          hintKind={kindHint}
          onHint={setKindHint}
        />
        <JudgmentLog
          view={view}
          arrivingId={arrivingId}
          pendingId={pendingId}
          kin={kin}
          onKin={setKin}
        />
      </div>

      <div className={`judgment__after ${step(4)}`}>
        {view.lessons.length ? (
          <section className="judgment__field judgment__lessons" aria-labelledby="judgment-field-lessons">
            <h2 id="judgment-field-lessons">What it taught me</h2>
            <ul>
              {view.lessons.map(lesson => (
                <li key={lesson.id}>
                  <span>{lesson.text}</span>
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

      {error ? <p className="judgment__error" role="alert">{error}</p> : null}
    </main>
  );
};

const Judgment = () => {
  const { pageId = '' } = useParams();
  const [items, setItems] = useState([]);
  const [indexPages, setIndexPages] = useState([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [articles, setArticles] = useState([]);
  const [readingLoading, setReadingLoading] = useState(true);
  const [readingUnreadable, setReadingUnreadable] = useState(false);
  const [indexError, setIndexError] = useState('');

  useEffect(() => {
    document.body.classList.add('judgment-route');
    return () => document.body.classList.remove('judgment-route');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIndexLoading(true);
      setIndexError('');

      /* Drift is supporting context, never a release gate for the casebook.
         Start it beside the index and let it settle independently. */
      if (!pageId) {
        setReadingLoading(true);
        setReadingUnreadable(false);
        Promise.resolve().then(() => getArticles())
          .then(read => {
            if (cancelled) return;
            setArticles(Array.isArray(read) ? read : []);
            setReadingLoading(false);
            setReadingUnreadable(false);
          })
          .catch(() => {
            if (!cancelled) {
              setReadingLoading(false);
              setReadingUnreadable(true);
            }
          });
      }

      try {
        /* The index renders one sentence and a provenance line per judgment.
           Asking for whole pages meant every Tiptap body, every plainText, and
           every source and claim ledger in the corpus came down the wire so
           that almost all of them could be filtered out on arrival.

           Source events come alongside rather than after: they say which
           claims have had evidence arrive that nobody has read, and that is
           the only thing this list is allowed to raise its voice about. */
        /* Detail and index share this exact request key. On a case route the
           shelf and the dependency graph therefore reuse one in-flight read
           instead of asking Mongo for the same casebook twice. */
        const [summaryPages, dossierReviews] = await Promise.all([
          listWikiPages({ projection: 'judgment', limit: 500 }),
          listCompanyDossierJudgmentReviews({ limit: 200 }).catch(() => [])
        ]);
        let pages = Array.isArray(summaryPages) ? summaryPages : [];
        let nextItems = markPendingDossierResearch(buildJudgmentIndex(pages, []), dossierReviews);

        /* A summary row is an optimization, not the source of truth. Older
           pages can predate fields in the compact projection; if that makes a
           non-empty Wiki corpus look like an empty casebook, recover once
           from the full accepted pages rather than lying to the user. */
        if (!nextItems.length && pages.length) {
          const fullPages = await listWikiPages({ limit: 200 });
          pages = Array.isArray(fullPages) ? fullPages : [];
          nextItems = markPendingDossierResearch(buildJudgmentIndex(pages, []), dossierReviews);
        }
        if (!cancelled) {
          setIndexPages(pages);
          setItems(nextItems);
          setIndexLoading(false);
        }

        /* Movement signals refine the already-rendered casebook. Their
           endpoint may be slow or unavailable without hiding the cases the
           user already owns. */
        Promise.resolve().then(() => listWikiSourceEvents({ limit: SOURCE_EVENT_LIMIT }))
          .then(events => {
            if (!cancelled) {
              setItems(markPendingDossierResearch(buildJudgmentIndex(pages, events), dossierReviews));
            }
          })
          .catch(() => {});
      } catch (error) {
        if (!cancelled) {
          setIndexError('Could not load your judgments.');
          setIndexLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pageId]);

  return (
    <div className="judgment-room">
      <div className="judgment-room__content">
        {/* The lock draws nothing behind the claim. A constellation drifting
            past a judgment is decoration on the one page in the product that
            should carry none. */}
        {pageId
          ? (
            <JudgmentDetail
              pageId={pageId}
              initialPage={indexPages.find(page => String(page?._id || '') === String(pageId)) || null}
            />
          )
          : (
            <>
              <JudgmentIndex
                items={items}
                articles={articles}
                loading={indexLoading}
                readingLoading={readingLoading}
                readingUnreadable={readingUnreadable}
                onHeld={(item) => setItems((current) => {
                  const rest = current.filter((row) => String(row.id) !== String(item.id));
                  const prior = current.find((row) => String(row.id) === String(item.id));
                  return [{
                    ...prior,
                    ...item,
                    title: prior?.title || item.title,
                    headline: prior?.headline || item.headline,
                    lessons: prior?.lessons || item.lessons || []
                  }, ...rest];
                })}
              />
              {indexError ? <p className="judgment__error" role="alert">{indexError}</p> : null}
            </>
          )}
      </div>
      <aside className="judgment-room__shelf">
        <JudgmentShelf items={items} activeId={pageId} />
      </aside>
    </div>
  );
};

export default Judgment;
