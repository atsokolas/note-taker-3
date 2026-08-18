import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  dismissReadingLoopThread,
  getReadingLoop,
  refreshReadingLoopConnection,
  runReadingLoopMechanic
} from '../api/readingLoop';
import { recordClaimCheckIn } from '../api/dailyLoop';
import { updateQuestion } from '../api/questions';
import { createWikiPage } from '../api/wiki';
import { formatSurfaceDate } from '../utils/dateDisplay';
import { takeFirstPaint } from '../motion/columnMotion';
import '../styles/wiki-front-page.css';
import '../styles/paper.css';

// The Paper — the Reading Loop's surface and the product's landing page.
//
// The daily loop borrows the world's clock; this borrows the corpus's. The
// lead is a Connection: something read recently set against something read
// months ago and forgotten, with the agent saying what the two do to each
// other. It is complete on its own — a reader who takes it in and closes the
// tab got the value. Actions are available, never demanded.
//
// The four sections below run only when asked. Every one of them is allowed
// to say nothing; an honest empty state is the design, not a gap in it.

const MECHANICS = [
  {
    kind: 'collision',
    label: 'Collision',
    invitation: 'Check your recent reading against the claims you hold.'
  },
  {
    kind: 'resolution',
    label: 'Resolution',
    invitation: 'See whether something you read answered a question you left open.'
  },
  {
    kind: 'convergence',
    label: 'Convergence',
    invitation: 'Find several things you have read landing on one older idea.'
  },
  {
    kind: 'thread',
    label: 'The unnamed thread',
    invitation: 'Name what you’ve been reading toward but haven’t written down.'
  }
];

const mastheadDate = () => new Date().toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric'
});

const sourceDate = (iso) => formatSurfaceDate(iso, { includeYear: true, fallback: '' });

const Receipt = ({ children }) => (
  <p className="paper__receipt">{children}</p>
);

/**
 * One end of a connection: the source named, dated, and quoted. The quote is
 * the evidence — it is verified server-side to appear verbatim in the source,
 * so it is safe to present as the thing the author actually wrote.
 */
const SourceEnd = ({ kicker, end }) => {
  if (!end) return null;
  const date = sourceDate(end.at);
  return (
    <div className="paper__end">
      <p className="paper__end-kicker">
        {kicker}
        {date ? <span className="paper__end-date"> · {date}</span> : null}
      </p>
      {end.href ? (
        <Link className="paper__end-title" to={end.href}>{end.title}</Link>
      ) : (
        <span className="paper__end-title">{end.title}</span>
      )}
      {end.quote ? <blockquote className="paper__quote">{end.quote}</blockquote> : null}
    </div>
  );
};

const RelationCard = ({ card, lead = false, children }) => {
  if (!card) return null;
  return (
    <article className={`paper__card${lead ? ' paper__card--lead' : ''}`}>
      <SourceEnd kicker="You read" end={card.recent} />
      <SourceEnd kicker="From your library" end={card.dormant} />
      {card.converging?.length ? (
        <div className="paper__converging">
          <p className="paper__end-kicker">Also landed here</p>
          <ul>
            {card.converging.slice(1).map(item => (
              <li key={`${item.type}:${item.id}`}>
                <Link to={item.href}>{item.title}</Link>
                {sourceDate(item.at) ? <span className="paper__end-date"> · {sourceDate(item.at)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="paper__relation">
        {(card.lines || []).map((line, index) => (
          <p className="paper__relation-line" key={index}>{line}</p>
        ))}
      </div>
      {children}
    </article>
  );
};

const ThreadCard = ({ card, onName, onDismiss, busy }) => {
  if (!card) return null;
  return (
    <article className="paper__card paper__card--thread">
      <h3 className="paper__thread-name">{card.name}</h3>
      <p className="paper__relation-line">{card.line}</p>
      <p className="paper__end-kicker">{card.sources?.length || 0} sources, no page</p>
      <ul className="paper__thread-sources">
        {(card.sources || []).map(source => (
          <li key={`${source.type}:${source.id}`}>
            <Link to={source.href}>{source.title}</Link>
            {sourceDate(source.at) ? <span className="paper__end-date"> · {sourceDate(source.at)}</span> : null}
          </li>
        ))}
      </ul>
      <div className="paper__actions">
        <button type="button" className="paper__action" onClick={onName} disabled={busy}>Name it</button>
        <button type="button" className="paper__action paper__action--quiet" onClick={onDismiss} disabled={busy}>Not a thing</button>
      </div>
    </article>
  );
};

/* The Paper is now the top of the wiki rather than a room of its own, so it
   renders as a section inside that page instead of the page itself. Same
   layout, same lead, one size down: it is what the reading turned up this
   morning, and under it is everything the reading has built. */
const Paper = ({ compact = false, lead = null, tail = null }) => {
  const navigate = useNavigate();
  const [edition, setEdition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState({});
  const [refreshingLead, setRefreshingLead] = useState(false);
  // The Paper arrives the way every other surface does: one brief entrance on
  // first sight this session, a crossfade on the way back.
  const arriving = useMemo(() => takeFirstPaint('paper'), []);
  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : 'paper__return');

  const load = useCallback(async () => {
    try {
      const data = await getReadingLoop();
      setEdition(data.edition || null);
      setRefreshingLead(Boolean(data.connectionRefreshing));
      setError('');
    } catch (_err) {
      setError('Could not open the paper.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The lead is precomputed on the system's cadence. When the server says a
  // refresh is running, check back once rather than making the reader wait on
  // a spinner for work that may take a while.
  useEffect(() => {
    if (!refreshingLead) return undefined;
    const timer = setTimeout(() => { load(); }, 12000);
    return () => clearTimeout(timer);
  }, [refreshingLead, load]);

  const setMechanic = (kind, mechanic) => {
    if (!mechanic) return;
    setEdition(current => (current ? { ...current, [kind]: mechanic } : current));
  };

  const note = (kind, message) => setNotes(current => ({ ...current, [kind]: message }));

  const runMechanic = async (kind) => {
    setBusy(kind);
    note(kind, '');
    try {
      const mechanic = await runReadingLoopMechanic(kind);
      setMechanic(kind, mechanic);
    } catch (err) {
      note(kind, err?.response?.status === 429
        ? 'Daily limit reached. Resets tomorrow.'
        : 'That run failed. Try again.');
    } finally {
      setBusy('');
    }
  };

  const refreshLead = async () => {
    setBusy('connection');
    note('connection', '');
    try {
      const mechanic = await refreshReadingLoopConnection();
      setMechanic('connection', mechanic);
    } catch (err) {
      note('connection', err?.response?.status === 429
        ? 'Daily limit reached. Resets tomorrow.'
        : 'Could not refresh the lead.');
    } finally {
      setBusy('');
    }
  };

  const checkIn = async (action) => {
    const claim = edition?.collision?.card?.claim;
    if (!claim) return;
    setBusy('collision');
    try {
      const result = await recordClaimCheckIn({ pageId: claim.pageId, claimId: claim.claimId, action });
      note('collision', result.acknowledgment || `Claim ${action}.`);
    } catch (_err) {
      note('collision', 'Could not record that.');
    } finally {
      setBusy('');
    }
  };

  const markAnswered = async () => {
    const question = edition?.resolution?.card?.question;
    if (!question) return;
    setBusy('resolution');
    try {
      await updateQuestion(question.id, { status: 'answered' });
      note('resolution', 'Marked answered.');
    } catch (_err) {
      note('resolution', 'Could not update the question.');
    } finally {
      setBusy('');
    }
  };

  const nameThread = async () => {
    const card = edition?.thread?.card;
    if (!card) return;
    setBusy('thread');
    try {
      const page = await createWikiPage({
        title: card.name,
        createdFrom: { label: 'Reading Loop — unnamed thread' }
      });
      const pageId = page?._id || page?.id;
      if (pageId) navigate(`/wiki/workspace?page=${encodeURIComponent(pageId)}`);
      else note('thread', 'Page created.');
    } catch (_err) {
      note('thread', 'Could not create the page.');
    } finally {
      setBusy('');
    }
  };

  const dismissThread = async () => {
    const card = edition?.thread?.card;
    if (!card) return;
    setBusy('thread');
    try {
      const mechanic = await dismissReadingLoopThread(card.threadKey);
      setMechanic('thread', mechanic);
    } catch (_err) {
      note('thread', 'Could not dismiss that.');
    } finally {
      setBusy('');
    }
  };

  const masthead = useMemo(() => mastheadDate(), []);
  const connection = edition?.connection;
  const coldStart = edition?.coldStart;

  const Frame = compact ? 'section' : 'main';
  /* Inside the wiki the page's own headline is the h1; the paper's lead is the
     first thing under it, not a second title for the same page. */
  const LeadTitle = compact ? 'h2' : 'h1';
  const frameProps = compact
    ? { className: `paper paper--compact${lead ? ' paper--led' : ''}`, 'aria-label': 'The Paper' }
    : { className: 'paper' };

  if (loading) {
    return (
      <Frame {...frameProps} aria-busy="true">
        <header className="paper__masthead">
          <p className="paper__masthead-title">Noeis · The Paper</p>
          <p className="paper__masthead-date">{masthead}</p>
        </header>
        <p className="paper__loading" role="status">Reading your library back to you…</p>
      </Frame>
    );
  }

  return (
    <Frame {...frameProps}>
      {/* On the wiki the lead is a claim you hold, and the paper's own masthead
          would be a second eyebrow over it. The lead slot brings its own. */}
      {lead ? <div className={step(1)}>{lead}</div> : (
        <header className={`paper__masthead ${step(1)}`}>
          <p className="paper__masthead-title">Noeis · The Paper</p>
          <p className="paper__masthead-date">{masthead}</p>
        </header>
      )}

      {error ? <div className="paper__error" role="alert">{error}</div> : null}

      <section className={`paper__lead ${step(2)}`} aria-labelledby="paper-lead-title">
        {lead ? <p className="paper__continue-label">Continue</p> : null}
        {coldStart ? (
          <>
            <LeadTitle id="paper-lead-title" className="paper__lead-title">The loop isn&rsquo;t running yet.</LeadTitle>
            <p className="paper__relation-line">{coldStart.reason}</p>
            {coldStart.readyAt ? (
              <Receipt>
                first connection possible {new Date(coldStart.readyAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </Receipt>
            ) : null}
            <div className="paper__actions">
              <Link className="paper__action" to="/library">Open your library</Link>
              <Link className="paper__action paper__action--quiet" to="/wiki">Go to the wiki</Link>
            </div>
          </>
        ) : connection?.status === 'ready' && connection.card ? (
          <>
            <LeadTitle id="paper-lead-title" className="paper__lead-title">
              You read something close to this {sourceDate(connection.card.dormant?.at) || 'a while ago'}.
            </LeadTitle>
            <RelationCard card={connection.card} lead />
            <div className="paper__lead-foot">
              {/* The refresh count is a thing the machine keeps, not news. */}
              {lead ? <span /> : (
                <Receipt>
                  refreshed {sourceDate(connection.generatedAt) || 'just now'}
                  {connection.dailyRunCap ? ` · ${connection.runsUsedToday}/${connection.dailyRunCap} refreshes today` : ''}
                </Receipt>
              )}
              <button type="button" className="paper__action paper__action--quiet" onClick={refreshLead} disabled={busy === 'connection'}>
                {busy === 'connection' ? 'Reading…' : 'Refresh'}
              </button>
            </div>
            {notes.connection ? <Receipt>{notes.connection}</Receipt> : null}
          </>
        ) : (
          <>
            <LeadTitle id="paper-lead-title" className="paper__lead-title">
              {refreshingLead
                ? 'Reading your library…'
                : connection?.status === 'error'
                  ? 'The paper could not be read today.'
                  : 'Nothing worth connecting yet.'}
            </LeadTitle>
            <p className={`paper__relation-line${connection?.status === 'error' ? ' paper__degraded' : ''}`}>
              {refreshingLead
                ? 'The agent is pairing your recent reading against your older library. This takes a moment.'
                : connection?.reason || 'Nothing you have read recently meets anything older closely enough to be worth your attention.'}
            </p>
            <div className="paper__lead-foot">
              {connection?.generatedAt ? <Receipt>last looked {sourceDate(connection.generatedAt)}</Receipt> : <span />}
              <button type="button" className="paper__action paper__action--quiet" onClick={refreshLead} disabled={busy === 'connection'}>
                {busy === 'connection' ? 'Reading…' : 'Look again'}
              </button>
            </div>
            {notes.connection ? <Receipt>{notes.connection}</Receipt> : null}
          </>
        )}
      </section>

      {/* Four words on one line, not four boxes.
          Each of these was a section with a RUN button and a "not run yet"
          receipt under it — about six hundred pixels of the front page spent
          telling you that nothing had happened. The lock draws them as a row
          of words you can press. What comes back still opens below. */}
      {lead ? (
        <div className={`paper__mechanics ${step(4)}`}>
          {MECHANICS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              className="paper__mechanic-word"
              onClick={() => runMechanic(kind)}
              disabled={busy === kind || Boolean(coldStart)}
            >
              {busy === kind ? `${label}…` : label}
            </button>
          ))}
        </div>
      ) : null}

      {lead ? MECHANICS.filter(({ kind }) => edition?.[kind]?.status === 'ready' && edition[kind].card).map(({ kind, label }) => {
        const mechanic = edition[kind];
        const running = busy === kind;
        return (
          <section className="paper__section paper__section--open" key={kind} aria-labelledby={`paper-${kind}`}>
            <h2 className="paper__section-label" id={`paper-${kind}`}>{label}</h2>
            {kind === 'thread' ? (
              <ThreadCard card={mechanic.card} onName={nameThread} onDismiss={dismissThread} busy={running} />
            ) : (
              <RelationCard card={mechanic.card}>
                {kind === 'collision' && mechanic.card.claim ? (
                  <div className="paper__actions">
                    <button type="button" className="paper__action" onClick={() => checkIn('reaffirmed')} disabled={running}>Still hold</button>
                    <Link className="paper__action" to={mechanic.card.claim.href}>Revise</Link>
                    <button type="button" className="paper__action paper__action--quiet" onClick={() => checkIn('retired')} disabled={running}>Retire</button>
                  </div>
                ) : null}
                {kind === 'resolution' && mechanic.card.question ? (
                  <div className="paper__actions">
                    <Link className="paper__action" to={mechanic.card.question.href}>Open the question</Link>
                    <button type="button" className="paper__action paper__action--quiet" onClick={markAnswered} disabled={running}>Mark answered</button>
                  </div>
                ) : null}
              </RelationCard>
            )}
            {notes[kind] ? <Receipt>{notes[kind]}</Receipt> : null}
          </section>
        );
      }) : null}

      {tail ? <div className={step(5)}>{tail}</div> : null}

      {lead ? null : MECHANICS.map(({ kind, label, invitation }) => {
        const mechanic = edition?.[kind];
        const running = busy === kind;
        return (
          <section className="paper__section" key={kind} aria-labelledby={`paper-${kind}`}>
            <div className="paper__section-head">
              <h2 className="paper__section-label" id={`paper-${kind}`}>{label}</h2>
              <button type="button" className="paper__run" onClick={() => runMechanic(kind)} disabled={running || Boolean(coldStart)}>
                {running ? 'Reading…' : 'Run'}
              </button>
            </div>

            {mechanic?.status === 'ready' && mechanic.card ? (
              kind === 'thread' ? (
                <ThreadCard card={mechanic.card} onName={nameThread} onDismiss={dismissThread} busy={running} />
              ) : (
                <RelationCard card={mechanic.card}>
                  {kind === 'collision' && mechanic.card.claim ? (
                    <div className="paper__actions">
                      <button type="button" className="paper__action" onClick={() => checkIn('reaffirmed')} disabled={running}>Still hold</button>
                      <Link className="paper__action" to={mechanic.card.claim.href}>Revise</Link>
                      <button type="button" className="paper__action paper__action--quiet" onClick={() => checkIn('retired')} disabled={running}>Retire</button>
                    </div>
                  ) : null}
                  {kind === 'resolution' && mechanic.card.question ? (
                    <div className="paper__actions">
                      <Link className="paper__action" to={mechanic.card.question.href}>Open the question</Link>
                      <button type="button" className="paper__action paper__action--quiet" onClick={markAnswered} disabled={running}>Mark answered</button>
                    </div>
                  ) : null}
                </RelationCard>
              )
            ) : (
              <p className={`paper__section-empty${mechanic?.status === 'error' ? ' paper__degraded' : ''}`}>
                {mechanic?.status === 'empty' || mechanic?.status === 'error' ? mechanic.reason : invitation}
              </p>
            )}

            <div className="paper__section-foot">
              <Receipt>
                {mechanic?.generatedAt ? `last run ${sourceDate(mechanic.generatedAt)}` : 'not run yet'}
                {mechanic?.dailyRunCap ? ` · ${mechanic.runsUsedToday}/${mechanic.dailyRunCap} today` : ''}
              </Receipt>
              {notes[kind] ? <Receipt>{notes[kind]}</Receipt> : null}
            </div>
          </section>
        );
      })}

      {/* Standing on the wiki already, so there is nowhere to send anyone. */}
      {compact ? null : (
        <footer className="paper__foot">
          <Link className="paper__foot-link" to="/wiki">Morning paper &amp; watchers →</Link>
        </footer>
      )}
    </Frame>
  );
};

export default Paper;
