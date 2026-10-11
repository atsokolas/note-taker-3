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
  }
]);

module.exports = { CASES };
