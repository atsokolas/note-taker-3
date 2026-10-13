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

  /* The author's highlight and the reader's margin note are two statements:
     each can be quoted, but never run together as one quotation. */
  it('never joins a highlight and its margin note into one quotation', () => {
    const highlight = 'The resistance to checklists is mostly about identity. Your note: Same thing happens with code review checklists.';
    expect(quotedIn('The resistance to checklists is mostly about identity', [highlight])).toBe(true);
    expect(quotedIn('Same thing happens with code review checklists', [highlight])).toBe(true);
    expect(quotedIn('mostly about identity. Same thing happens with code review', [highlight])).toBe(false);
    expect(quotedIn('mostly about identity. Your note: Same thing happens', [highlight])).toBe(false);
    expect(quotedIn('mostly about identity … Same thing happens with code review', [highlight])).toBe(false);
    const page = `${highlight}\n\nThe second passage says teams skip the list under pressure.`;
    expect(quotedIn('Same thing happens with code review … teams skip the list under pressure', [page])).toBe(false);
    expect(quotedIn('The second passage says teams skip the list', [page])).toBe(true);
  });

  /* A passage of nothing quotes nothing, so it is never found. */
  it('never finds a passage with no words in it', () => {
    expect(quotedIn('…', [source])).toBe(false);
    expect(quotedIn('', [source])).toBe(false);
  });
});

describe('unstatedFigures', () => {
  const { unstatedFigures } = require('../agentGrounding');
  const filing = 'Revenue was $81,615 million, up 85% from a year ago. Gross margin was 75.0%.';

  it('finds a figure in the source at the scale the source states it', () => {
    expect(unstatedFigures('Revenue reached $81.6 billion, up 85%.', [filing])).toEqual([]);
  });

  it('names the figures no source states', () => {
    expect(unstatedFigures('Revenue reached $90 billion with a 78% gross margin.', [filing])).toEqual(['$90 billion', '78%']);
  });

  it('accepts a computed figure whose inputs the claim shows and the source states', () => {
    expect(unstatedFigures('Revenue grew 85% to $81.6 billion; $81.6 billion is 8.16x a $10 billion base.', [filing, 'A $10 billion base.'])).toEqual([]);
    expect(unstatedFigures('Gross profit of $61.2 billion is 75.0% of $81.6 billion.', [filing, 'Gross profit $61,212 million.'])).toEqual([]);
  });

  it('follows arithmetic through a scale factor and a computed figure', () => {
    const q = 'Revenue was $96,221 million. Operating income was $66,595 million. Fiscal revenue was $215.9 billion.';
    expect(unstatedFigures('Annualized, revenue is near $384,884 million ($96,221m x 4), about 1.8x the $215.9 billion fiscal base.', [q])).toEqual([]);
  });

  it('follows unit shifts, products and subtraction chains', () => {
    const k = 'Net income $9,226 million. Diluted EPS $20.76. Operating cash flow $15,820 million, capex $6,435 million, dividends $2,458 million, buybacks $847 million. Price $958.32.';
    expect(unstatedFigures('An implied 444.4 million shares (9,226 / 20.76) at $958.32 is about $425.9bn.', [k])).toEqual([]);
    expect(unstatedFigures('That leaves $15.82bn - $6.435bn - $2.458bn - $0.847bn = $6.08bn.', [k])).toEqual([]);
    expect(unstatedFigures('Operating cash flow of $15.82bn, or 15.82 in billions.', [k])).toEqual([]);
  });

  it('reads a threshold to watch as no claim', () => {
    expect(unstatedFigures('A gross margin below roughly 70% would weaken the case.', [filing])).toEqual([]);
  });

  it('does not accept a computed figure whose inputs are missing or wrong', () => {
    expect(unstatedFigures('Operating margin was 66%.', [filing])).toEqual(['66%']);
    expect(unstatedFigures('Gross profit of $61.2 billion is 80% of $81.6 billion.', [filing, 'Gross profit $61,212 million.'])).toEqual(['80%']);
  });

  it('reads a range like the high-80s as no figure', () => {
    expect(unstatedFigures('A renewal rate below the high-80s (currently 89.8%) would matter, as in the 1990s.', ['Renewal rate 89.8%.'])).toEqual([]);
  });

  it('follows doubling written in words', () => {
    const half = 'Operating income $122,871 million.';
    expect(unstatedFigures('Doubling $122.87 billion gives about $245.7 billion.', [half])).toEqual([]);
    expect(unstatedFigures('That gives about $245.7 billion.', [half])).toEqual(['$245.7 billion']);
  });

  it('ignores years and small counts', () => {
    expect(unstatedFigures('In 2026 three of 5 segments grew.', [filing])).toEqual([]);
  });
});
