const { groundedIn } = require('../agentGrounding');

describe('groundedIn', () => {
  const article = { id: 'a1', title: 'Checklists', fullText: 'Experts experience a checklist as an insult to their judgment, so they skip it.' };
  const note = { id: 'n1', title: 'Sleep', snippet: 'Tired people choose the default and call it a decision.' };

  it('names the sources whose own words the reply carries', () => {
    expect(groundedIn('The essay says experts experience a checklist as an insult to their judgment.', [article, note]))
      .toEqual([article]);
  });

  it('does not count paraphrase', () => {
    expect(groundedIn('Experts feel insulted by checklists.', [article, note])).toEqual([]);
  });

  it('reads the snippet when there is no full text, and ignores missing items', () => {
    expect(groundedIn('As you noted, tired people choose the default and call it a decision.', [null, note]))
      .toEqual([note]);
  });
});

describe('quotedIn', () => {
  const { quotedIn } = require('../agentGrounding');
  const source = 'Agents reached a task competence of 83.54% across workflows.';

  it('finds a passage word for word, ellipses marking what was left out', () => {
    expect(quotedIn('a task competence … across workflows', [source])).toBe(true);
    expect(quotedIn('a task competence of 90%', [source])).toBe(false);
  });

  /* A passage of nothing quotes nothing, so it is never found. */
  it('never finds a passage with no words in it', () => {
    expect(quotedIn('…', [source])).toBe(false);
    expect(quotedIn('', [source])).toBe(false);
  });
});
