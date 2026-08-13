import { cleanSourceTextForDisplay } from './ideaWorkbenchText';
import {
  isIdeaWorkbenchConceptIdentityReady,
  reconcileHydratedWorkbench,
  resolveLoadedWorkbenchTitle,
  resolveIdeaWorkbenchConceptKey
} from './useIdeaWorkbenchModel';

jest.mock('../../../../api/agent', () => ({ chatWithAgent: jest.fn() }));
jest.mock('../../../../api/concepts', () => ({}));
jest.mock('../../../../hooks/useConceptMaterial', () => jest.fn());
jest.mock('../../../../tour/useTourSignal', () => jest.fn());

describe('resolveIdeaWorkbenchConceptKey', () => {
  it('prefers the exact continuity id over URL-mangled presentation names', () => {
    expect(resolveIdeaWorkbenchConceptKey({
      conceptId: '64f100000000000000000020',
      concept: { name: 'Investigation+%+Δ' }
    })).toBe('64f100000000000000000020');
  });

  it('retains ordinary Concept id and legacy name fallbacks', () => {
    expect(resolveIdeaWorkbenchConceptKey({
      concept: { _id: 'concept-1', name: 'Inference economics' }
    })).toBe('concept-1');
    expect(resolveIdeaWorkbenchConceptKey({
      concept: { name: 'Inference economics' }
    })).toBe('Inference economics');
  });

  it('blocks explicit-id hydration until the matching Concept object is loaded', () => {
    expect(isIdeaWorkbenchConceptIdentityReady({
      conceptId: 'target-id',
      concept: { _id: 'source-id', name: 'Source Concept' }
    })).toBe(false);
    expect(isIdeaWorkbenchConceptIdentityReady({
      conceptId: 'target-id',
      concept: { _id: 'target-id', name: 'Target Concept' }
    })).toBe(true);
    expect(isIdeaWorkbenchConceptIdentityReady({
      concept: { _id: 'legacy-id', name: 'Legacy Concept' }
    })).toBe(true);
  });
});

describe('reconcileHydratedWorkbench', () => {
  const buildState = (title, html, cards = []) => ({
    version: 1,
    header: { label: 'Idea', title, prompt: 'Prompt', stage: 'Seed' },
    workspaceDraft: '',
    workspaceDraftType: 'Note',
    importedSourceKeys: cards.map(card => card.sourceKey),
    cards,
    changeDrafts: [],
    hypothesis: {
      html,
      versions: [{ id: `${title}-v1`, label: 'v1', html, createdAt: '2026-08-12T00:00:00.000Z' }]
    },
    meta: {},
    agent: { comments: [], messages: [] }
  });

  it('keeps the server snapshot when the notebook was untouched during hydration', () => {
    const initial = buildState('Seed title', '<p></p>');
    const remote = buildState('Persisted title', '<p>Persisted notebook</p>');

    expect(reconcileHydratedWorkbench({
      remoteState: remote,
      stateAtHydrationStart: initial,
      latestState: initial
    })).toBe(remote);
  });

  it('merges an inline source added while hydration is pending over the arriving snapshot', () => {
    const initial = buildState('Source provenance', '<p></p>');
    const remoteCard = { id: 'remote', sourceKey: 'article:1', title: 'Remote source', createdAt: '2026-08-11T00:00:00.000Z' };
    const inlineCard = { id: 'inline', sourceKey: 'highlight:1', title: 'Selected passage', createdAt: '2026-08-12T00:00:00.000Z' };
    const remote = buildState('Persisted title', '<p>Older persisted notebook</p>', [remoteCard]);
    const edited = buildState(
      'Source provenance',
      '<blockquote data-source-key="highlight:1"><p>Selected passage</p></blockquote>',
      [inlineCard]
    );

    const reconciled = reconcileHydratedWorkbench({
      remoteState: remote,
      stateAtHydrationStart: initial,
      latestState: edited
    });

    expect(reconciled.header.title).toBe('Source provenance');
    expect(reconciled.hypothesis.html).toContain('Selected passage');
    expect(reconciled.cards).toEqual(expect.arrayContaining([remoteCard, inlineCard]));
  });
});

describe('resolveLoadedWorkbenchTitle', () => {
  it('lets the exact Concept identity replace only the untouched default title', () => {
    expect(resolveLoadedWorkbenchTitle('Untitled idea', 'source-provenance')).toBe('source-provenance');
    expect(resolveLoadedWorkbenchTitle('', 'source-provenance')).toBe('source-provenance');
    expect(resolveLoadedWorkbenchTitle('A deliberate working title', 'source-provenance'))
      .toBe('A deliberate working title');
  });
});

describe('cleanSourceTextForDisplay', () => {
  it('removes imported template artifacts from article and note previews', () => {
    expect(cleanSourceTextForDisplay(
      'Name: The Intelligent Investor | URL: https://example.com/book | Reading Time: 12 minutes. ( attr(href) ) Thought and Opinion'
    )).toBe('The Intelligent Investor');
  });

  it('keeps useful prose while normalizing separators', () => {
    expect(cleanSourceTextForDisplay(
      'Margin of safety | Buying at a discount protects against mistakes.'
    )).toBe('Margin of safety · Buying at a discount protects against mistakes.');
  });
});
