import { cleanSourceTextForDisplay } from './ideaWorkbenchText';
import {
  isIdeaWorkbenchConceptIdentityReady,
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
