/**
 * Stage 1 graph proof.
 *
 * "Pull one Library highlight into a case, persist the forward and reverse
 * edges, reload both objects, and open the original source passage."
 *
 * Each step composes the functions the product actually runs — no
 * reimplementation of the rules under test. "Reload" is a round trip through
 * JSON, which is what a save and a re-fetch do to these objects and the point
 * at which an edge that lived only in memory would disappear.
 */
import { acceptProposalIntoJudgment, projectView } from './judgmentModel';
import { pageSpeaksToSource, pickFolioLine } from '../components/reader/folioModel';
import { parseSourceOrigin, buildCanonicalHighlightPath } from '../utils/sourceRoutes';

const ARTICLE_ID = 'article-99';
const HIGHLIGHT_ID = 'highlight-7';
const PASSAGE = 'Warehouse membership renewals held above ninety percent through the cycle.';

const casePage = () => ({
  _id: 'case-1',
  title: 'Costco',
  kind: 'judgment',
  updatedAt: '2026-08-31T00:00:00.000Z',
  sourceRefs: [],
  claims: [],
  judgment: {
    currentJudgment: 'Costco membership economics survive a consumer downturn.',
    why: [],
    against: [],
    assumptions: []
  }
});

const libraryCandidate = () => ({
  acceptedFrom: `highlight:${ARTICLE_ID}:${HIGHLIGHT_ID}`,
  body: PASSAGE,
  sourceLabel: 'Costco FY25 10-K'
});

/** What a save and a re-fetch do to an object. */
const reload = (value) => JSON.parse(JSON.stringify(value));

describe('graph proof — a Library highlight becomes bound evidence', () => {
  it('carries the forward edge from the case back to the exact passage, after a reload', () => {
    const page = casePage();
    const filed = { ...page, judgment: acceptProposalIntoJudgment(page, libraryCandidate(), 'why') };

    const reloaded = reload(filed);
    const view = projectView(reloaded);

    expect(view.forPassages).toHaveLength(1);
    const [source] = view.forPassages;
    expect(source.text).toBe(PASSAGE);
    expect(source.source).toBe('Costco FY25 10-K');
    // The door leads to the passage, not to a search for it.
    expect(source.href).toBe(buildCanonicalHighlightPath({
      articleId: ARTICLE_ID,
      highlightId: HIGHLIGHT_ID
    }));
    expect(source.href).toContain(ARTICLE_ID);
    expect(source.href).toContain(HIGHLIGHT_ID);
  });

  it('carries the reverse edge from the source back to the case, after a reload', () => {
    const page = casePage();
    const filed = { ...page, judgment: acceptProposalIntoJudgment(page, libraryCandidate(), 'why') };
    const reloaded = reload(filed);

    expect(pageSpeaksToSource(reloaded, ARTICLE_ID, { highlightIds: [HIGHLIGHT_ID] })).toBe(true);

    const line = pickFolioLine([reloaded], {
      articleId: ARTICLE_ID,
      highlightIds: [HIGHLIGHT_ID],
      preferredId: 'case-1'
    });
    expect(line).not.toBeNull();
    expect(line.text).toBe('Costco membership economics survive a consumer downturn.');
  });

  it('binds only the source it was filed from', () => {
    const page = casePage();
    const filed = reload({ ...page, judgment: acceptProposalIntoJudgment(page, libraryCandidate(), 'why') });

    expect(pageSpeaksToSource(filed, 'article-other', { highlightIds: ['highlight-other'] })).toBe(false);
    expect(pickFolioLine([filed], { articleId: 'article-other' })).toBeNull();
  });

  it('leaves no edge in either direction when nothing was filed', () => {
    const untouched = reload(casePage());
    expect(projectView(untouched).forPassages).toHaveLength(0);
    expect(pageSpeaksToSource(untouched, ARTICLE_ID, { highlightIds: [HIGHLIGHT_ID] })).toBe(false);
    expect(pickFolioLine([untouched], { articleId: ARTICLE_ID })).toBeNull();
  });

  it('files counterevidence with the same two edges', () => {
    const page = casePage();
    const filed = reload({ ...page, judgment: acceptProposalIntoJudgment(page, libraryCandidate(), 'against') });
    const view = projectView(filed);

    expect(view.againstPassages).toHaveLength(1);
    expect(view.againstPassages[0].href).toContain(HIGHLIGHT_ID);
    expect(pageSpeaksToSource(filed, ARTICLE_ID, { highlightIds: [HIGHLIGHT_ID] })).toBe(true);
  });

  it('the origin it stored is the origin the reader parses', () => {
    const page = casePage();
    const filed = reload({ ...page, judgment: acceptProposalIntoJudgment(page, libraryCandidate(), 'why') });
    const origin = parseSourceOrigin(filed.judgment.why[0].acceptedFrom);

    expect(origin).toEqual({ kind: 'highlight', articleId: ARTICLE_ID, highlightId: HIGHLIGHT_ID });
  });
});
