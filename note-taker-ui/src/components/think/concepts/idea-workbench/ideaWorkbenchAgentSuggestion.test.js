import { resolveAgentHypothesisSuggestion } from './ideaWorkbenchAgentSuggestion';

describe('resolveAgentHypothesisSuggestion', () => {
  it('applies the agent draft when the hypothesis is empty', () => {
    const result = resolveAgentHypothesisSuggestion({
      currentHtml: '<p></p>',
      proposedText: 'A clearer working hypothesis.',
      action: 'rewrite-clearly'
    });

    expect(result.applied).toBe(true);
    expect(result.nextHypothesisHtml).toContain('A clearer working hypothesis.');
    expect(result.versionSummary).toBe('Agent rewrote the hypothesis for clarity.');
  });

  it('preserves an existing draft and returns a separate suggestion', () => {
    const result = resolveAgentHypothesisSuggestion({
      currentHtml: '<p>My original hypothesis draft.</p>',
      proposedText: 'An agent rewrite that should not overwrite the draft.',
      action: 'strengthen-hypothesis'
    });

    expect(result.applied).toBe(false);
    expect(result.nextHypothesisHtml).toBe('<p>My original hypothesis draft.</p>');
    expect(result.versionSummary).toBe('');
    expect(result.commentCaption).toContain('Kept separate from your draft');
    expect(result.commentBody).toContain('An agent rewrite that should not overwrite the draft.');
  });
});
