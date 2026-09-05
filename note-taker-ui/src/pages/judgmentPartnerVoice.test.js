import { PARTNER_ACK } from './judgmentModel';

/* The partner's canonical lines, pinned. A character that drifts a word a
   month is five characters by spring; the bible lives in
   docs/noeis-partner-voice.md and this test holds its quotations. */

describe('the skeptical partner’s voice', () => {
  it('acknowledges a held claim in one dry cited line', () => {
    expect(PARTNER_ACK).toBe('Noted. I’ll look for what cuts against it.');
  });

  it('keeps every canonical line short, dry, and unpunctuated', () => {
    for (const line of [PARTNER_ACK]) {
      expect(line.split(/\s+/).length).toBeLessThanOrEqual(20);
      expect(line).not.toMatch(/!/);
    }
  });
});
