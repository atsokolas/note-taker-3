import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getDecisions } from '../api/decisions';
import { getWikiPage, listWikiPages } from '../api/wiki';
import ThoughtPartnerPanel from '../components/agent/ThoughtPartnerPanel';
import '../styles/judgment-room.css';

const JUDGMENT_VIEWS = [
  { id: 'dossiers', label: 'Dossiers', note: 'Grounded cases' },
  { id: 'decisions', label: 'Decisions', note: 'As made' },
  { id: 'reviews', label: 'Reviews due', note: 'Human-set clocks' },
  { id: 'outcomes', label: 'Outcomes', note: 'Never inferred' },
  { id: 'lessons', label: 'Lessons', note: 'Human-confirmed' }
];

const WIKI_PAGE_CACHE_KEY = 'noeis.wiki.frontPageSnapshot.v1';
const WIKI_PAGE_CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

const clean = (value) => String(value || '').trim();
const idOf = (value) => clean(value?._id || value?.id || value);
const list = (value) => (Array.isArray(value) ? value : []);
const safeHref = (value) => {
  const href = clean(value);
  return href.startsWith('/') && !href.startsWith('//') ? href : '';
};
const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const readWikiPageCache = () => {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(WIKI_PAGE_CACHE_KEY) || 'null');
    const cachedAt = Number(parsed?.cachedAt);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > WIKI_PAGE_CACHE_MAX_AGE_MS) return [];
    return Array.isArray(parsed?.pages) ? parsed.pages : [];
  } catch (_error) {
    return [];
  }
};

const writeWikiPageCache = (pages) => {
  try {
    const previous = JSON.parse(window.localStorage?.getItem(WIKI_PAGE_CACHE_KEY) || 'null') || {};
    window.localStorage?.setItem(WIKI_PAGE_CACHE_KEY, JSON.stringify({
      ...previous,
      cachedAt: Date.now(),
      pages: Array.isArray(pages) ? pages : []
    }));
  } catch (_error) {
    // Cache is a private perceived-speed affordance. Storage failures must not
    // block the exact server read models.
  }
};

const isJudgmentPage = (page) => Boolean(
  page?.investmentDossier?.version
  || page?.judgment?.kind
  || list(page?.judgment?.decisions).length
);

const normalizedView = (value) => (
  JUDGMENT_VIEWS.some(option => option.id === value) ? value : 'dossiers'
);

export const resolveJudgmentView = (search = '') => {
  const id = normalizedView(new URLSearchParams(search).get('view'));
  return JUDGMENT_VIEWS.find(option => option.id === id) || JUDGMENT_VIEWS[0];
};

export const decisionMatchesJudgmentView = (item, view) => {
  if (!item) return false;
  if (view === 'reviews') return ['overdue', 'upcoming'].includes(clean(item?.dueState));
  if (view === 'outcomes') return clean(item?.outcome?.state) !== 'observed'
    && clean(item?.decision?.status) === 'taken';
  if (view === 'lessons') return clean(item?.outcome?.state) === 'observed'
    && Boolean(clean(item?.outcome?.lesson));
  return true;
};

export const buildJudgmentCases = (pages = [], decisions = []) => {
  const decisionPages = new Map();
  list(decisions).forEach((item) => {
    const pageId = clean(item?.identity?.pageId);
    if (!pageId) return;
    if (!decisionPages.has(pageId)) decisionPages.set(pageId, []);
    decisionPages.get(pageId).push(item);
  });

  const cases = new Map();
  list(pages).filter(isJudgmentPage).forEach((page) => {
    const pageId = idOf(page);
    if (!pageId) return;
    cases.set(pageId, {
      pageId,
      title: clean(page?.title) || 'Untitled case',
      page,
      decisions: decisionPages.get(pageId) || []
    });
  });
  decisionPages.forEach((pageDecisions, pageId) => {
    if (cases.has(pageId)) return;
    const page = pageDecisions[0]?.page || {};
    cases.set(pageId, {
      pageId,
      title: clean(page?.title) || 'Untitled case',
      page,
      decisions: pageDecisions
    });
  });
  return [...cases.values()].sort((left, right) => {
    const decisionDelta = right.decisions.length - left.decisions.length;
    return decisionDelta || left.title.localeCompare(right.title);
  });
};

const exactCaseHref = ({ view, pageId, decisionId = '' }) => {
  const query = new URLSearchParams({ view, page: pageId });
  if (decisionId) query.set('decision', decisionId);
  return `/judgment?${query.toString()}`;
};

const groundingFor = (item) => ({
  claims: list(item?.links?.claims?.resolved),
  sources: list(item?.links?.sources?.resolved),
  missingClaims: list(item?.links?.claims?.missingIds),
  missingSources: list(item?.links?.sources?.missingIds)
});

const Grounding = ({ item }) => {
  const grounding = groundingFor(item);
  if (!item) return <p className="judgment-case__unavailable">No accepted decision grounds yet.</p>;
  return (
    <div className="judgment-case__grounding" aria-label="Accepted grounds">
      <span>{grounding.claims.length} accepted Wiki claim{grounding.claims.length === 1 ? '' : 's'}</span>
      <span>{grounding.sources.length} owned Library source{grounding.sources.length === 1 ? '' : 's'}</span>
      {grounding.missingClaims.length || grounding.missingSources.length ? (
        <span className="is-incomplete">Some exact grounds are unavailable.</span>
      ) : null}
    </div>
  );
};

const Chapter = ({ number, title, children, item, id }) => (
  <section className="judgment-case__chapter" id={id}>
    <span className="judgment-case__number" aria-hidden="true">{number}</span>
    <div className="judgment-case__chapter-body">
      <h2>{title}</h2>
      {children}
    </div>
    <Grounding item={item} />
  </section>
);

const TruthList = ({ items, empty }) => {
  const rows = list(items).map(item => clean(item?.text || item?.question || item)).filter(Boolean);
  if (!rows.length) return <p className="judgment-case__unavailable">{empty}</p>;
  return <ul className="judgment-case__truth-list">{rows.map(row => <li key={row}>{row}</li>)}</ul>;
};

const TraceNode = ({ label, href, state = '', detail = '' }) => (
  <li className={state ? `is-${state}` : undefined}>
    <span aria-hidden="true" />
    <div>
      <strong>{label}</strong>
      {href ? <Link to={href}>{detail || 'View exact record'} →</Link> : <small>{detail || 'Not yet recorded'}</small>}
    </div>
  </li>
);

const Judgment = () => {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const activeView = resolveJudgmentView(location.search);
  const initialPages = useMemo(() => readWikiPageCache(), []);
  const [pages, setPages] = useState(initialPages);
  const [decisionData, setDecisionData] = useState({ items: [], counts: null });
  const [fullPage, setFullPage] = useState(null);
  const [loading, setLoading] = useState(!initialPages.length);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let pagesSettled = false;
    let decisionsSettled = false;
    let failures = 0;
    if (!initialPages.length) setLoading(true);
    setError('');
    const finish = ({ source, failed = false, hasCases = false }) => {
      if (source === 'pages') pagesSettled = true;
      if (source === 'decisions') decisionsSettled = true;
      if (failed) failures += 1;
      if (cancelled) return;
      // Decisions and dossier pages are independent read models. Reveal the
      // casebook as soon as either honest source arrives instead of letting a
      // slow page index hide receipt-verified decisions that are already ready.
      if (initialPages.length || source === 'pages' || hasCases || (pagesSettled && decisionsSettled)) {
        setLoading(false);
      }
      if (pagesSettled && decisionsSettled && failures === 2) {
        setError('Could not open the living casebook.');
      }
    };
    listWikiPages({ limit: 500, includeLowQuality: 1 })
      .then((value) => {
        if (!cancelled) {
          setPages(value);
          writeWikiPageCache(value);
        }
        finish({ source: 'pages' });
      }, () => finish({ source: 'pages', failed: true }));
    getDecisions({ filter: 'all', limit: 100, windowDays: 365 })
      .then((value) => {
        if (!cancelled) setDecisionData(value);
        finish({ source: 'decisions', hasCases: Boolean(value?.items?.length) });
      }, () => finish({ source: 'decisions', failed: true }));
    return () => { cancelled = true; };
  }, [initialPages.length]);

  const allCases = useMemo(
    () => buildJudgmentCases(pages, decisionData.items),
    [pages, decisionData.items]
  );
  const visibleCases = useMemo(() => {
    if (activeView.id === 'dossiers') return allCases;
    return allCases.filter(caseItem => caseItem.decisions.some(
      item => decisionMatchesJudgmentView(item, activeView.id)
    ));
  }, [activeView.id, allCases]);

  const requestedPageId = clean(params.get('page'));
  const selectedCase = visibleCases.find(item => item.pageId === requestedPageId)
    || allCases.find(item => item.pageId === requestedPageId)
    || visibleCases[0]
    || allCases[0]
    || null;
  const requestedDecisionId = clean(params.get('decision'));
  const matchingDecisions = selectedCase?.decisions.filter(
    item => activeView.id === 'dossiers' || decisionMatchesJudgmentView(item, activeView.id)
  ) || [];
  const selectedDecision = matchingDecisions.find(
    item => clean(item?.identity?.decisionId) === requestedDecisionId
  ) || matchingDecisions[0] || selectedCase?.decisions[0] || null;

  useEffect(() => {
    const pageId = selectedCase?.pageId;
    if (!pageId) {
      setFullPage(null);
      return undefined;
    }
    let cancelled = false;
    setPageLoading(true);
    getWikiPage(pageId).then((page) => {
      if (!cancelled) setFullPage(page);
    }).catch(() => {
      if (!cancelled) setFullPage(selectedCase.page || null);
    }).finally(() => {
      if (!cancelled) setPageLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedCase?.page, selectedCase?.pageId]);

  const page = fullPage || selectedCase?.page || null;
  const decision = selectedDecision?.decision || null;
  const outcome = selectedDecision?.outcome || null;
  const observed = clean(outcome?.state) === 'observed';
  const continuityComplete = selectedDecision?.continuity?.complete === true;
  const pageHref = safeHref(selectedDecision?.page?.href)
    || (selectedCase?.pageId ? `/wiki/workspace?page=${encodeURIComponent(selectedCase.pageId)}` : '');
  const decisionHref = safeHref(selectedDecision?.subject?.href) || pageHref;
  const grounding = groundingFor(selectedDecision);
  const firstClaimHref = safeHref(grounding.claims[0]?.href);
  const firstSourceHref = safeHref(grounding.sources[0]?.href);
  const currentJudgment = clean(page?.judgment?.currentJudgment);
  const falsifiers = list(page?.judgment?.falsifiers);
  const unknowns = list(page?.judgment?.unknowns);
  const acceptedRevisionId = clean(selectedDecision?.continuity?.acceptedRevisionId);
  const viewCounts = {
    dossiers: allCases.length,
    decisions: allCases.reduce((count, item) => count + item.decisions.length, 0),
    reviews: Number(decisionData.counts?.upcoming_review || 0),
    outcomes: Number(decisionData.counts?.awaiting_outcome || 0),
    lessons: Number(decisionData.counts?.reviewed || 0)
  };

  const memo = !selectedDecision
    ? 'No accepted decision is attached to this case yet.'
    : !continuityComplete
      ? 'The historical chain is incomplete. Interpretation is paused.'
      : observed
        ? clean(outcome?.calibrationNote) || 'An observed outcome is recorded with exact evidence.'
        : 'Original grounds are preserved. No outcome has been inferred.';

  return (
    <section className="judgment-room noeis-editorial">
      <div className="judgment-casebook-shell">
        <aside className="judgment-room__rail" aria-label="Judgment sections">
          <p className="judgment-room__rail-label">Casebook</p>
          <nav>
            {JUDGMENT_VIEWS.map(option => (
              <NavLink
                key={option.id}
                className={`judgment-room__rail-link${activeView.id === option.id ? ' is-active' : ''}`}
                to={`/judgment?view=${option.id}`}
                aria-current={activeView.id === option.id ? 'page' : undefined}
              >
                <span>{option.label}</span>
                <small>{option.note}</small>
                <em>{viewCounts[option.id]}</em>
              </NavLink>
            ))}
          </nav>
          {visibleCases.length ? (
            <div className="judgment-room__cases">
              <p className="judgment-room__rail-label">Living cases</p>
              {visibleCases.map(caseItem => {
                const decisionId = caseItem.decisions[0]?.identity?.decisionId || '';
                return (
                  <Link
                    key={caseItem.pageId}
                    className={selectedCase?.pageId === caseItem.pageId ? 'is-active' : undefined}
                    to={exactCaseHref({ view: activeView.id, pageId: caseItem.pageId, decisionId })}
                  >
                    {caseItem.title}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </aside>

        <main className="judgment-case" aria-busy={loading || pageLoading || undefined}>
          {loading ? <p className="judgment-case__loading" role="status">Opening your living casebook…</p> : null}
          {error ? <p className="judgment-case__error" role="alert">{error}</p> : null}
          {!loading && !error && !selectedCase ? (
            <div className="judgment-case__empty">
              <p className="judgment-room__eyebrow">Judgment</p>
              <h1>No living cases yet</h1>
              <p>Accept a grounded Wiki claim before recording a consequential decision.</p>
              <Link to="/wiki">Open Wiki</Link>
            </div>
          ) : null}
          {selectedCase ? (
            <>
              <header className="judgment-case__heading">
                <p className="judgment-room__eyebrow">Judgment · {activeView.label}</p>
                <h1>{selectedCase.title}</h1>
                <p>{decision?.summary || 'A living case grounded in accepted knowledge.'}</p>
              </header>

              <section className="judgment-case__timefold" aria-label="Judgment time comparison">
                <div>
                  <span>At decision</span>
                  <p>{clean(decision?.rationale) || 'No accepted decision-time rationale is available.'}</p>
                  {decision?.acceptedAt ? <small>{formatDate(decision.acceptedAt)}</small> : null}
                </div>
                <i aria-hidden="true">→</i>
                <div>
                  <span>Now</span>
                  <p>{observed
                    ? clean(outcome?.summary) || 'An outcome was observed.'
                    : currentJudgment || 'No later outcome or judgment has been accepted.'}</p>
                  {observed && outcome?.observedAt ? <small>{formatDate(outcome.observedAt)}</small> : null}
                </div>
              </section>

              <div className="judgment-case__chapters">
                <Chapter number="1" title="Current thesis" item={selectedDecision} id="current-thesis">
                  <p>{currentJudgment || clean(decision?.rationale) || 'No accepted current thesis is available.'}</p>
                </Chapter>
                <Chapter number="2" title="What would change my mind" item={selectedDecision} id="falsifiers">
                  <TruthList items={falsifiers} empty="No accepted falsifiers are recorded." />
                  {unknowns.length ? <TruthList items={unknowns} empty="" /> : null}
                </Chapter>
                <Chapter number="3" title="Decision record" item={selectedDecision} id="decision-record">
                  {decision ? (
                    <>
                      <p><strong>{decision.summary}</strong></p>
                      {decision.expectedOutcome ? <p>Expected: {decision.expectedOutcome}</p> : null}
                      <p className={continuityComplete ? 'judgment-case__verified' : 'judgment-case__blocked'}>
                        {continuityComplete
                          ? `Continuity verified${acceptedRevisionId ? ` · accepted revision ${acceptedRevisionId}` : ''}`
                          : 'Continuity incomplete. Noeis will not reconstruct missing grounds.'}
                      </p>
                    </>
                  ) : <p className="judgment-case__unavailable">No accepted decision is attached.</p>}
                </Chapter>
                <Chapter number="4" title="Outcome & lesson" item={selectedDecision} id="outcome-lesson">
                  {observed ? (
                    <>
                      <p><strong>{clean(outcome?.result) || 'Observed'}</strong>{outcome?.observedAt ? ` · ${formatDate(outcome.observedAt)}` : ''}</p>
                      {outcome?.summary ? <p>{outcome.summary}</p> : null}
                      {outcome?.lesson ? <blockquote>{outcome.lesson}</blockquote> : <p>No confirmed lesson is recorded.</p>}
                    </>
                  ) : clean(outcome?.state) === 'review_incomplete' ? (
                    <p className="judgment-case__blocked">Outcome review is incomplete. It is not treated as observed.</p>
                  ) : (
                    <p className="judgment-case__unavailable">Noeis has not inferred an outcome.</p>
                  )}
                </Chapter>
              </div>
              {decisionHref ? <Link className="judgment-case__reground" to={decisionHref}>Reground in the exact record →</Link> : null}
            </>
          ) : null}
        </main>

        <aside className="judgment-partner" aria-label="Judgment partner">
          <header>
            <p className="judgment-room__eyebrow">Persistent agent</p>
            <h2>Judgment partner</h2>
          </header>
          <section className="judgment-partner__memo" aria-label="Calibration memo">
            <span>Calibration memo</span>
            <p>{memo}</p>
          </section>
          {selectedDecision ? (
            <nav className="judgment-partner__actions" aria-label="Case actions">
              {decisionHref ? <Link to={decisionHref}>Review original grounds →</Link> : null}
              {firstClaimHref ? <Link to={firstClaimHref}>Inspect an accepted claim →</Link> : null}
              {firstSourceHref ? <Link to={firstSourceHref}>Return to Library evidence →</Link> : null}
            </nav>
          ) : null}
          <ThoughtPartnerPanel
            contextType={selectedCase ? 'wiki' : 'global'}
            contextId={selectedCase?.pageId || 'judgment-index'}
            contextTitle={selectedCase?.title || 'Judgment'}
            title="Ask about this case"
            subtitle="Grounded in accepted knowledge"
            placeholder="Ask what changed, what held, or what you missed…"
            emptyStateText="Challenge the grounds, compare the expected outcome, or identify missing evidence."
            promptTemplates={[
              'Challenge the accepted grounds behind this decision.',
              'What has changed since this decision was made?',
              'What outcome evidence is still missing?'
            ]}
            contextMetadata={{
              pageId: selectedCase?.pageId || null,
              decisionId: selectedDecision?.identity?.decisionId || null,
              acceptedRevisionId: acceptedRevisionId || null,
              summary: decision?.summary || 'Living Judgment casebook.',
              nextActions: [
                'Review the immutable decision-time grounds.',
                'Separate observed outcomes from interpretation.',
                'Require human confirmation before retaining a lesson.'
              ]
            }}
          />
        </aside>

        <aside className="judgment-trace" aria-label="Judgment trace">
          <header>
            <p className="judgment-room__eyebrow">Judgment trace</p>
            <p>Evidence to learning, without rewriting history.</p>
          </header>
          <ol>
            <TraceNode label="Source" href={firstSourceHref} detail={grounding.sources[0]?.title || 'No exact source'} state={firstSourceHref ? 'verified' : 'missing'} />
            <TraceNode label="Claim" href={firstClaimHref} detail={grounding.claims[0]?.title || 'No accepted claim'} state={firstClaimHref ? 'verified' : 'missing'} />
            <TraceNode label="Decision" href={decisionHref} detail={decision?.summary || 'No accepted decision'} state={continuityComplete ? 'verified' : 'missing'} />
            <TraceNode label="Outcome" href={observed ? decisionHref : ''} detail={observed ? clean(outcome?.result) || 'Observed' : 'Not inferred'} state={observed ? 'verified' : 'waiting'} />
            <TraceNode label="Lesson" href={observed && outcome?.lesson ? decisionHref : ''} detail={outcome?.lesson ? 'Human-confirmed' : 'Not retained'} state={observed && outcome?.lesson ? 'verified' : 'waiting'} />
          </ol>
          <p className="judgment-trace__note">Every consequential update remains human-confirmed and receipt-bound.</p>
        </aside>
      </div>
    </section>
  );
};

export default Judgment;
