import {
  buildWorkbenchChatReply,
  buildWorkbenchDraftMessage,
  buildWorkbenchRestructureReply
} from './ideaWorkbenchPartnerCopy';

describe('ideaWorkbenchPartnerCopy', () => {
  it('builds complete support draft messages without clipped fragments', () => {
    const reply = buildWorkbenchDraftMessage({
      kind: 'support',
      provenance: 'your archive',
      cards: [
        {
          title: 'Hidden Support',
          content: 'Making the evidence visible helps people test the claim. This keeps the draft grounded...'
        }
      ]
    });

    expect(reply).toContain('I prepared 1 support point from your archive.');
    expect(reply).toContain('The clearest footing is Making the evidence visible helps people test the claim.');
    expect(reply).not.toContain('...');
  });

  it('builds fallback question draft messages with an explicit scout failure sentence', () => {
    const reply = buildWorkbenchDraftMessage({
      kind: 'question',
      provenance: 'local material',
      unavailableReason: 'The richer scout pass was unavailable.',
      cards: [
        {
          title: 'Falsification test',
          content: 'What evidence would actually weaken this concept'
        }
      ]
    });

    expect(reply).toContain('The richer scout pass was unavailable.');
    expect(reply).toContain('I prepared 1 open question from local material.');
    expect(reply).toContain('The sharpest open question is What evidence would actually weaken this concept?');
  });

  it('builds restructure replies with explicit lane placement', () => {
    const reply = buildWorkbenchRestructureReply([
      { title: 'Hidden Support' },
      { title: 'Fragile Premise' },
      { title: 'Missing Proof' }
    ]);

    expect(reply).toBe('Done. I sorted the latest leads: "Hidden Support" into support, "Fragile Premise" into tension, and "Missing Proof" into open questions.');
  });

  it('builds local support replies as complete sentences', () => {
    const reply = buildWorkbenchChatReply({
      intent: 'support',
      card: {
        content: 'Several materials imply that making reasoning visible helps people judge and refine ideas...'
      }
    });

    expect(reply).toBe('The strongest current support is this: Several materials imply that making reasoning visible helps people judge and refine ideas.');
  });
});
