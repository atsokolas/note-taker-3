import { rememberOpenedJudgment } from './folioModel';
import {
  passageFileCandidate,
  pickPassageDoor,
  pickUnfiledPassageMatch
} from './passageDoor';

const highlightId = 'h1';
const articleId = 'article-1';

const claim = (id, extras = {}) => ({
  _id: id,
  title: extras.title ?? extras.currentJudgment ?? 'A claim.',
  updatedAt: extras.updatedAt || '2026-08-01T00:00:00.000Z',
  evergreen: Boolean(extras.evergreen),
  sourceRefs: extras.sourceRefs || [{
    _id: `src-${id}`,
    type: 'article',
    objectId: extras.objectId || articleId
  }],
  judgment: {
    currentJudgment: extras.currentJudgment || 'Compute stays scarce.',
    why: extras.why || [],
    against: extras.against || []
  }
});

const filed = (field, extras = {}) => claim(extras.id || 'wiki-compute', {
  currentJudgment: extras.currentJudgment || 'Demand still outruns deliverable capacity.',
  updatedAt: extras.updatedAt,
  evergreen: extras.evergreen,
  objectId: extras.objectId || 'other',
  [field]: [{
    reasonId: `${field}-1`,
    text: 'A passage from the filing.',
    acceptedFrom: extras.acceptedFrom || `highlight:${articleId}:${highlightId}`,
    createdAt: extras.createdAt || '2026-08-20T00:00:00.000Z'
  }]
});

describe('pickPassageDoor', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('opens the claim this passage was filed as Why for', () => {
    expect(pickPassageDoor([filed('why')], { highlightId, articleId })).toEqual({
      id: 'wiki-compute',
      text: 'Demand still outruns deliverable capacity.',
      href: '/judgment/wiki-compute',
      stance: 'Why'
    });
  });

  it('opens the claim this passage was filed as Against for', () => {
    expect(pickPassageDoor([filed('against')], { highlightId, articleId })).toEqual({
      id: 'wiki-compute',
      text: 'Demand still outruns deliverable capacity.',
      href: '/judgment/wiki-compute',
      stance: 'Against'
    });
  });

  it('is silent when the passage was never filed, even if the article is on the ledger', () => {
    expect(pickPassageDoor([claim('p1')], { highlightId, articleId })).toBeNull();
  });

  it('is silent when a different passage was filed', () => {
    expect(pickPassageDoor([filed('why', {
      acceptedFrom: `highlight:${articleId}:h-other`
    })], { highlightId, articleId })).toBeNull();
  });

  it('is silent without a passage', () => {
    expect(pickPassageDoor([filed('why')], { articleId })).toBeNull();
    expect(pickPassageDoor([filed('why')], { highlightId: '' })).toBeNull();
  });

  it('is silent when the ledger is soup — a source-ref without a filed origin', () => {
    const soup = claim('p1', {
      sourceRefs: [{ _id: 'src-h', type: 'highlight', objectId: highlightId }]
    });
    expect(pickPassageDoor([soup], { highlightId, articleId })).toBeNull();
  });

  it('is one door when several claims filed the same passage', () => {
    const older = filed('why', {
      id: 'older',
      currentJudgment: 'The older claim.',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
    const newer = filed('against', {
      id: 'newer',
      currentJudgment: 'The newer claim.',
      updatedAt: '2026-08-20T00:00:00.000Z'
    });
    expect(pickPassageDoor([older, newer], { highlightId, articleId })).toEqual({
      id: 'newer',
      text: 'The newer claim.',
      href: '/judgment/newer',
      stance: 'Against'
    });
    expect(pickPassageDoor([older, newer], {
      highlightId,
      articleId,
      preferredId: 'older'
    }).href).toBe('/judgment/older');
  });

  it('prefers the claim that was just open', () => {
    rememberOpenedJudgment('older');
    const older = filed('why', {
      id: 'older',
      currentJudgment: 'The older claim.',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
    const newer = filed('why', {
      id: 'newer',
      currentJudgment: 'The newer claim.',
      updatedAt: '2026-08-20T00:00:00.000Z'
    });
    expect(pickPassageDoor([newer, older], { highlightId, articleId }).id).toBe('older');
  });
});

const MATCHING = 'Deliverable capacity lags demand by two years.';
const SOUP = 'A 13F filing was posted. It does not touch the capacity gap.';
const HOLD = 'Demand still outruns deliverable capacity.';

describe('pickUnfiledPassageMatch', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  const open = (extras = {}) => claim(extras.id || 'wiki-compute', {
    currentJudgment: extras.currentJudgment || HOLD,
    updatedAt: extras.updatedAt,
    evergreen: extras.evergreen,
    objectId: extras.objectId
  });

  it('offers the claim this passage covers, with the origin the whisper will need', () => {
    expect(pickUnfiledPassageMatch([open()], {
      highlightId,
      articleId,
      text: MATCHING
    })).toEqual({
      id: 'wiki-compute',
      text: HOLD,
      href: '/judgment/wiki-compute',
      origin: `highlight:${articleId}:${highlightId}`
    });
  });

  it('is silent when the passage is leftover-word soup', () => {
    expect(pickUnfiledPassageMatch([open()], {
      highlightId,
      articleId,
      text: SOUP
    })).toBeNull();
  });

  it('is silent when the passage was already filed — the whisper owns that door', () => {
    expect(pickUnfiledPassageMatch([filed('why')], {
      highlightId,
      articleId,
      text: MATCHING
    })).toBeNull();
  });

  it('is silent without a passage to match', () => {
    expect(pickUnfiledPassageMatch([open()], { highlightId, articleId })).toBeNull();
    expect(pickUnfiledPassageMatch([open()], {
      highlightId,
      articleId,
      text: '   '
    })).toBeNull();
  });

  it('is silent without an origin that can be filed', () => {
    expect(pickUnfiledPassageMatch([open()], {
      highlightId,
      text: MATCHING
    })).toBeNull();
    expect(pickUnfiledPassageMatch([open()], {
      articleId,
      text: MATCHING
    })).toBeNull();
  });

  it('is one offer when several claims match, preferring the one just open', () => {
    rememberOpenedJudgment('older');
    const older = open({
      id: 'older',
      currentJudgment: HOLD,
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
    const newer = open({
      id: 'newer',
      currentJudgment: 'NVIDIA demand still outruns deliverable capacity.',
      updatedAt: '2026-08-20T00:00:00.000Z'
    });
    expect(pickUnfiledPassageMatch([newer, older], {
      highlightId,
      articleId,
      text: MATCHING
    }).id).toBe('older');
  });
});

describe('passageFileCandidate', () => {
  it('keeps the same origin the inbox files, so Why can become the whisper', () => {
    expect(passageFileCandidate({
      articleId,
      highlightId,
      text: MATCHING,
      sourceLabel: 'On compute'
    })).toEqual({
      id: `highlight:${articleId}:${highlightId}`,
      text: MATCHING,
      sourceLabel: 'On compute'
    });
  });

  it('refuses a candidate that cannot be filed back', () => {
    expect(passageFileCandidate({ highlightId, text: MATCHING })).toBeNull();
    expect(passageFileCandidate({ articleId, highlightId, text: '  ' })).toBeNull();
  });
});
