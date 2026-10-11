// Reading talks back: a held view, one newly saved source, and what a careful
// reader would say the source does to the view. `silent` cases share words
// with the view but do not bear on what it claims; the only right answer is
// nothing at all.

const CASES = Object.freeze([
  {
    id: 'costco-supports',
    view: 'Costco’s membership model makes it recession-resistant.',
    source: 'Costco renews nearly ninety percent of its members every year. During the 2008 recession, renewal rates held above eighty-six percent while discretionary retailers saw double-digit declines in traffic.',
    expect: 'support'
  },
  {
    id: 'costco-challenges',
    view: 'Costco’s membership model makes it recession-resistant.',
    source: 'Households under strain buy smaller baskets more often. In the last downturn, Costco executive membership upgrades fell sharply and new membership sign-ups slowed for four straight quarters.',
    expect: 'challenge'
  },
  {
    id: 'costco-hotdog-silent',
    view: 'Costco’s membership model makes it recession-resistant.',
    source: 'The Costco hot dog has cost $1.50 since 1985. The food court menu is a favourite topic for fans, and the membership card doubles as a way to skip the parking lot queue at some warehouses.',
    expect: 'silent'
  },
  {
    id: 'rates-supports',
    view: 'Rates stay higher for longer than the market prices.',
    source: 'Core services inflation has not slowed in nine months, and the committee said it sees no case for cuts this year. Futures still price three cuts, a gap the minutes describe as unlikely to close.',
    expect: 'support'
  },
  {
    id: 'rates-challenges',
    view: 'Rates stay higher for longer than the market prices.',
    source: 'Unemployment rose for the fourth month in a row, and the chair said the committee is prepared to cut rates faster than markets expect if the labour market keeps weakening.',
    expect: 'challenge'
  },
  {
    id: 'rates-mortgage-silent',
    view: 'Rates stay higher for longer than the market prices.',
    source: 'Our guide to comparing mortgage rates: look at the APR, not only the headline rate, and ask lenders what the market for points looks like before you sign.',
    expect: 'silent'
  },
  {
    id: 'remote-supports',
    view: 'Remote work raises output for senior engineers.',
    source: 'In a two-year study of 1,600 engineers, senior engineers who worked remotely shipped twenty percent more reviewed code, while juniors received less feedback and shipped less.',
    expect: 'support'
  },
  {
    id: 'remote-challenges',
    view: 'Remote work raises output for senior engineers.',
    source: 'After the move to remote work, senior engineers spent nearly twice as many hours in meetings and mentoring over video, and their own merged changes fell by a third.',
    expect: 'challenge'
  },
  {
    id: 'remote-desk-silent',
    view: 'Remote work raises output for senior engineers.',
    source: 'Ten desks for remote work, reviewed by our senior editors. The standing desk raises to 120 centimetres and the output from its USB hub is enough for two monitors.',
    expect: 'silent'
  },
  {
    id: 'moat-supports',
    view: 'Network effects protect marketplaces better than brand does.',
    source: 'When a rival copied the brand and halved fees, sellers stayed because the buyers were here, and buyers stayed because the sellers were here. The network, not the logo, kept both sides.',
    expect: 'support'
  },
  {
    // No word in common with the view: only the meaning half finds it.
    id: 'warehouse-meaning-supports',
    view: 'Costco’s membership model makes it recession-resistant.',
    source: 'Warehouse club renewals barely dipped through the last downturn. Shoppers kept paying the annual fee even while they cut back on almost everything else.',
    expect: 'support'
  }
]);

// You hold the opposite: a sentence written in Think against a held view.
// Only `contradicts` is ever shown; sharing words is not contradiction.
const OPPOSITE_CASES = Object.freeze([
  {
    id: 'costco-opposite',
    view: 'Costco’s membership model makes it recession-resistant.',
    sentence: 'When a real recession comes, Costco members cancel faster than anyone expects.',
    expect: 'contradicts'
  },
  {
    id: 'costco-agrees',
    view: 'Costco’s membership model makes it recession-resistant.',
    sentence: 'Renewals held near ninety percent through 2008, which is what a recession-resistant model looks like.',
    expect: 'supports'
  },
  {
    id: 'costco-hotdog-unrelated',
    view: 'Costco’s membership model makes it recession-resistant.',
    sentence: 'The Costco hot dog has cost a dollar fifty since 1985, membership or not.',
    expect: 'unrelated'
  },
  {
    id: 'remote-opposite',
    view: 'Remote work raises output for senior engineers.',
    sentence: 'Senior engineers ship less at home; their best work happens in the office, side by side.',
    expect: 'contradicts'
  },
  {
    id: 'remote-desk-unrelated',
    view: 'Remote work raises output for senior engineers.',
    sentence: 'Our remote team finally agreed on a standing desk for the senior editors.',
    expect: 'unrelated'
  }
]);

// What would change your mind: an open falsifier of a held view, and a new
// source. Only a passage that reports the condition met is `meets`; one that
// shares its words but only forecasts or denies it is `silent`.
const FALSIFIER_CASES = Object.freeze([
  {
    id: 'costco-renewals-met',
    view: 'Costco’s membership model makes it recession-resistant.',
    falsifier: 'Renewal rates fall for two straight quarters.',
    source: 'Costco reported its second consecutive quarterly decline in membership renewal rates, the first such run since it began disclosing the figure.',
    expect: 'meets'
  },
  {
    id: 'costco-forecast-silent',
    view: 'Costco’s membership model makes it recession-resistant.',
    falsifier: 'Renewal rates fall for two straight quarters.',
    source: 'Some analysts ask whether renewal rates could fall for two straight quarters if a recession arrives; so far renewal rates have held steady at ninety percent.',
    expect: 'silent'
  },
  {
    id: 'rates-cut-met',
    view: 'Rates stay higher for longer than the market prices.',
    falsifier: 'The central bank cuts rates twice before summer.',
    source: 'With its decision in May, the central bank has now cut rates at two consecutive meetings this spring, taking the policy rate half a point lower.',
    expect: 'meets'
  }
]);

module.exports = { CASES, FALSIFIER_CASES, OPPOSITE_CASES };
