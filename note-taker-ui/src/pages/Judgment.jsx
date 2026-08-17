import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { askWikiPage, createWikiPage, getWikiPage, listWikiPages, listWikiSourceEvents, updateWikiPage } from '../api/wiki';
import { useAgentRail, useAgentRailSurface } from '../agent/AgentRailContext';
import { flySentenceInto, takeFirstPaint } from '../motion/columnMotion';
import {
  acceptProposalIntoJudgment,
  answerProvenance,
  buildJudgmentIndex,
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

const JudgmentIndex = ({ items }) => {
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
      const page = await createWikiPage({ title: sentence, pageType: 'topic' });
      const id = page?._id || page?.id;
      if (!id) throw new Error('The judgment was not created.');
      /* currentJudgment alone. Sending `kind` as well made the server ask for a
         governing question — a judgment page in its older shape is a question
         being investigated — and refuse with a 400 when there was none. A claim
         written here is not a question, and inventing one the human never wrote
         would put words in the page. The claim is what makes this a judgment. */
      await updateWikiPage(id, { judgment: { currentJudgment: sentence } });
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
        <ul className={`judgment__index ${enter}`}>
          {items.map(item => (
            <li key={item.id}>
              <Link to={`/judgment/${item.id}`}>{item.sentence}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`judgment__nothing ${enter}`}>
          No judgments yet. One starts the day you write down what you think and what would change your mind.
        </p>
      )}
    </main>
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        setPage(loaded);
        // Reading what arrived overnight is a read. It must not touch the
        // morning paper's cursor, so this reads the source events directly
        // rather than opening the daily loop.
        const events = await listWikiSourceEvents({ limit: SOURCE_EVENT_LIMIT });
        if (cancelled) return;
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

      <Link className={`judgment__back ${step(2)}`} to="/judgment">← All judgments</Link>

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
        const pages = await listWikiPages();
        if (!cancelled) setItems(buildJudgmentIndex(pages));
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
            <JudgmentIndex items={items} />
            {indexError ? <p className="judgment__error" role="alert">{indexError}</p> : null}
          </>
        )}
    </>
  );
};

export default Judgment;
