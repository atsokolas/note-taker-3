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

  it('recomputes working the claim shows, and follows a share\'s remainder', () => {
    const filing = 'Net sales $297,247 million and $269,912 million. Dividend $5.54. Price $954.50. Yield 1.5%. Growth 11% and 10%. Compute revenue $162.85 billion of $177.84 billion.';
    expect(unstatedFigures('Net sales grew 10% to $297,247 million from $269,912 million.', [filing])).toEqual([]);
    expect(unstatedFigures('Net sales grew 11% to $297,247 million from $269,912 million.', [filing])).toEqual(['11% to $297,247 million from $269,912 million']);
    expect(unstatedFigures('The yield is 0.58% ($5.54 / $954.50).', [filing])).toEqual([]);
    expect(unstatedFigures('The yield is 1.5% ($5.54 / $954.50).', [filing])).toEqual(['($5.54 / $954.50)']);
    expect(unstatedFigures('Compute was 91.6% ($162.85bn / $177.84bn), with the remaining 8.4% from Graphics.', [filing])).toEqual([]);
  });

  it('reads a slash between words as no division', () => {
    const filing = 'Renewal rate 92.3% in the U.S. and Canada and 89.8% worldwide.';
    expect(unstatedFigures('Renewal held near prior levels (92.3% U.S./Canada, 89.8% worldwide).', [filing])).toEqual([]);
  });

  it('reads both ends of a band to watch as the threshold', () => {
    expect(unstatedFigures('A renewal rate below approximately 88-89% would break the thesis.', ['Renewal rate 89.8%.'])).toEqual([]);
  });

  it('reads "tn" as trillions and follows a stated base carried forward at a compounding rate', () => {
    const sources = ['Market value of $5.52 trillion.', 'Diluted EPS $4.90.', 'Owner hurdle: 10% a year.'];
    expect(unstatedFigures('At $5.52tn the shares trade near 46x.', [...sources, '46x'])).toEqual([]);
    expect(unstatedFigures('Clearing the 10% hurdle for five years needs EPS of $7.89 ($4.90 x 1.10^5).', sources)).toEqual([]);
    expect(unstatedFigures('Clearing the 10% hurdle for five years needs EPS of $12.50 ($4.90 x 1.10^5).', sources)).toEqual(['$12.50']);
  });

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

  it('follows a percentage of a base, fractional scaling and mm', () => {
    const k = 'Gross margin 75.0%. Revenue $177,837 million. Net income $6,228 million; diluted shares 444,455 thousand.';
    expect(unstatedFigures('Gross profit was $133.4 billion (75.0% of $177.837 billion).', [k])).toEqual([]);
    expect(unstatedFigures('That is $14.01 a share ($6,228mm / 444.455mm); x 52/36 gives $8,996 million.', [k])).toEqual([]);
  });

  it('follows compounding and growth rates per year', () => {
    expect(unstatedFigures('A 10% hurdle compounds to 1.61x over five years (1.10^5 = 1.61).', ['Hurdle 10%.'])).toEqual([]);
    expect(unstatedFigures('Operating income rose from $7.79bn to $11.69bn, about 10.7% a year (($11.69bn / $7.79bn)^(1/4) - 1).', ['$7,793 million; $11,690 million'])).toEqual([]);
  });

  it('reads a day of the month as no figure and follows multiplying in words', () => {
    expect(unstatedFigures('Fiscal 2026 ended January 25, 2026.', ['nothing'])).toEqual([]);
    expect(unstatedFigures('Multiplying $59,688 million by four gives $238.75 billion.', ['Net income $59,688 million.'])).toEqual([]);
  });

  it('ignores years and small counts', () => {
    expect(unstatedFigures('In 2026 three of 5 segments grew.', [filing])).toEqual([]);
  });
});
