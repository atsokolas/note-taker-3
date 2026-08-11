#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { buildInvestmentDossierProfile } = require('../server/services/companyDossierService');
const { completeResearchPlan } = require('../server/services/investmentDossierProfileService');
const { buildValuationSnapshot } = require('../server/services/investmentValuationService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');

const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const REFERENCE_PAGE_ID = process.env.COSTCO_OWNER_REFERENCE_PAGE_ID || '6a62aa71a5153ffa3255d6de';
const OUTPUT_DIR = path.resolve(
  process.env.COSTCO_DOSSIER_OUTPUT
    || path.join(process.cwd(), 'output', 'costco-decision-dossier-2026-07-24')
);
const RESEARCH_AS_OF = new Date('2026-07-24T23:47:58.000Z');

const INPUTS = Object.freeze({
  price: 935.03,
  shares: 443_478_804,
  cashAndInvestmentsQ3: 19_996,
  debtQ3: 5_684,
  shortTermBorrowingsQ3: 96,
  fy2025NetSales: 269_912,
  fy2025MembershipFees: 5_323,
  fy2025OperatingIncome: 10_383,
  fy2025OperatingCashFlow: 13_335,
  fy2025Capex: 5_498,
  fy2025Inventory: 18_116,
  fy2024Inventory: 18_647,
  fy2025AccountsPayable: 19_783,
  fy2025MerchandiseCosts: 239_886,
  fy2025PaidMembers: 81_000_000,
  fy2025ExecutiveMembers: 38_700_000,
  fy2025ExecutiveSalesShare: 0.736,
  fy2025Warehouses: 914,
  fy2025SquareFeet: 134_700_000,
  q3PaidMembers: 82_900_000,
  q3MembershipFees: 1_373,
  ytd2026MembershipFees: 4_057,
  ytd2025MembershipFees: 3_599,
  ytd2026OperatingCashFlow: 11_133,
  ytd2025OperatingCashFlow: 9_468,
  ytd2026Capex: 4_228,
  ytd2025Capex: 3_532,
  q3Inventory: 19_418,
  q3AccountsPayable: 22_363,
  q3Warehouses: 928,
  juneWarehouses: 933,
  requiredReturn: 0.10,
  horizonYears: 5
});

const derived = Object.freeze((() => {
  const equityValue = INPUTS.price * INPUTS.shares / 1e9;
  const netCash = (
    INPUTS.cashAndInvestmentsQ3
    - INPUTS.debtQ3
    - INPUTS.shortTermBorrowingsQ3
  ) / 1e3;
  const enterpriseValue = equityValue - netCash;
  const fy2025FreeCashFlow = (INPUTS.fy2025OperatingCashFlow - INPUTS.fy2025Capex) / 1e3;
  const ytd2026FreeCashFlow = (INPUTS.ytd2026OperatingCashFlow - INPUTS.ytd2026Capex) / 1e3;
  const ytd2025FreeCashFlow = (INPUTS.ytd2025OperatingCashFlow - INPUTS.ytd2025Capex) / 1e3;
  const ltmFreeCashFlow = fy2025FreeCashFlow - ytd2025FreeCashFlow + ytd2026FreeCashFlow;
  const targetEquityValue = equityValue * ((1 + INPUTS.requiredReturn) ** INPUTS.horizonYears);
  const terminalFcf = terminalMultiple => targetEquityValue / terminalMultiple;
  const requiredFcfCagr = terminalMultiple => (
    (terminalFcf(terminalMultiple) / ltmFreeCashFlow) ** (1 / INPUTS.horizonYears) - 1
  );
  const averageInventory = (INPUTS.fy2025Inventory + INPUTS.fy2024Inventory) / 2;
  const inventoryTurns = INPUTS.fy2025MerchandiseCosts / averageInventory;
  const inventoryDays = 365 / inventoryTurns;
  const payableDays = INPUTS.fy2025AccountsPayable / INPUTS.fy2025MerchandiseCosts * 365;
  const executiveMemberShare = INPUTS.fy2025ExecutiveMembers / INPUTS.fy2025PaidMembers;
  const nonExecutiveMemberShare = 1 - executiveMemberShare;
  const executiveRelativeSpend = INPUTS.fy2025ExecutiveSalesShare / executiveMemberShare;
  const nonExecutiveRelativeSpend = (1 - INPUTS.fy2025ExecutiveSalesShare) / nonExecutiveMemberShare;
  return {
    equityValue,
    netCash,
    enterpriseValue,
    fy2025FreeCashFlow,
    ytd2026FreeCashFlow,
    ytd2025FreeCashFlow,
    ltmFreeCashFlow,
    targetEquityValue,
    terminalFcf25x: terminalFcf(25),
    terminalFcf30x: terminalFcf(30),
    terminalFcf35x: terminalFcf(35),
    terminalFcf40x: terminalFcf(40),
    requiredFcfCagr25x: requiredFcfCagr(25),
    requiredFcfCagr30x: requiredFcfCagr(30),
    requiredFcfCagr35x: requiredFcfCagr(35),
    requiredFcfCagr40x: requiredFcfCagr(40),
    currentPriceToLtmFcf: equityValue / ltmFreeCashFlow,
    currentFcfYield: ltmFreeCashFlow / equityValue,
    membershipFeeShareOfOperatingIncome: INPUTS.fy2025MembershipFees / INPUTS.fy2025OperatingIncome,
    membershipRevenuePerPaidMember: INPUTS.fy2025MembershipFees * 1e6 / INPUTS.fy2025PaidMembers,
    executiveMemberShare,
    executiveToNonExecutiveSpendRatio: executiveRelativeSpend / nonExecutiveRelativeSpend,
    inventoryTurns,
    inventoryDays,
    payableDays,
    fy2025SupplierFunding: (INPUTS.fy2025AccountsPayable - INPUTS.fy2025Inventory) / 1e3,
    q3SupplierFunding: (INPUTS.q3AccountsPayable - INPUTS.q3Inventory) / 1e3,
    supplierFundingIncrease: (
      INPUTS.q3AccountsPayable - INPUTS.q3Inventory
      - INPUTS.fy2025AccountsPayable + INPUTS.fy2025Inventory
    ) / 1e3,
    salesPerWarehouse: INPUTS.fy2025NetSales / INPUTS.fy2025Warehouses,
    salesPerSquareFoot: INPUTS.fy2025NetSales * 1e6 / INPUTS.fy2025SquareFeet,
    tenBasisPointOperatingIncomeShare: (
      INPUTS.fy2025NetSales * 0.001 / INPUTS.fy2025OperatingIncome
    ),
    underlyingMembershipGrowthShare: 1 - 0.35
  };
})());

const ANALYSIS_WORKBOOK_KEY = 'costco-analysis-workbook';
const ANALYSIS_WORKBOOK_SNIPPET = String(`
  Noeis analyst workbook, not external company evidence. Primary inputs transcribed from the cited Costco filings and official releases:
  price $935.03; 443,478,804 shares; cash and investments $19.996 billion; debt $5.684 billion; short-term borrowings $96 million;
  fiscal 2025 net sales $269.912 billion, membership fees $5.323 billion, operating income $10.383 billion, operating cash flow $13.335 billion,
  capital expenditure $5.498 billion, merchandise costs $239.886 billion, inventories $18.116 billion and $18.647 billion, accounts payable $19.783 billion,
  81.0 million paid members, 38.7 million Executive members, 73.6% Executive sales share, 914 warehouses, and 134.7 million operating square feet;
  first 36 weeks fiscal 2026 operating income $7.884 billion, operating cash flow $11.133 billion, capex $4.228 billion, inventory $19.418 billion,
  accounts payable $22.363 billion, 82.9 million paid members, 928 warehouses, 13% membership-fee growth, 35% attributable to the fee increase,
  $1.240 billion inventory cash use, $2.498 billion payable cash source, and a fiscal 2026 capex plan near $6.5 billion;
  fiscal 2025 repurchases 943,000 shares at $957.66 and first-36-week fiscal 2026 repurchases 638,000 shares at $945.46;
  fewer than 4,000 active SKUs, an approximately 147,000-square-foot average warehouse, 94% one-year employee retention, an average U.S. hourly rate near $32,
  92.2% U.S./Canada renewal, 89.7% worldwide renewal, 11.12% gross margin, 9.25% SG&A, $3.007 billion Executive rewards,
  86% of net sales and 84% of operating income from the U.S. and Canada, and 26% of U.S. sales from California.
  Reproducible outputs: equity value $415 billion; net cash $14.2 billion; mechanical trailing free cash flow $8.81 billion; current price-to-FCF 47.1 times;
  current FCF yield 2.1%; fiscal 2025 FCF $7.84 billion; five-year 10% return target equity value $668 billion;
  terminal cases 25, 30, 35, and 40 times require respectively 24.9%, 20.4%, 16.7%, and 13.6% annual FCF growth,
  with terminal FCF of $22.3 billion at 30 times, $19.1 billion at 35 times, and $16.7 billion at 40 times;
  fee income equals 51.3% of operating income and $65.72 per paid member; underlying membership growth share is 65.0%;
  Executive members are 47.8% of paid members and imply a 3.0-times Executive-to-non-Executive spend ratio;
  inventory turns are 13.1, inventory days 28.0, payable days 30.1, fiscal 2025 supplier funding $1.67 billion,
  May 2026 supplier funding $2.94 billion, and the increase $1.28 billion; sales per warehouse are $295.3 million;
  ten basis points on $269.9 billion of sales equal about $270 million or 2.6% of operating income.
  Analyst-defined decision parameters, not observed facts: $3,250 Executive reward break-even; 90% renewal falsifier; a 100-item matched-basket audit;
  terminal multiples of 25, 30, 35, and 40 times; and the September 24 fiscal-year review clock.
`).replace(/\s+/g, ' ').trim();

const SOURCES = Object.freeze([
  {
    key: 'fy2025-10k',
    provider: 'sec-edgar',
    title: 'Costco fiscal 2025 Form 10-K',
    url: 'https://www.sec.gov/Archives/edgar/data/909832/000090983225000101/cost-20250831.htm',
    archetype: 'filing',
    snippet: 'Primary filing for fiscal 2025 membership, warehouse system, SKU count, renewal, financial statements, cash flow, inventory, payables, employees, Kirkland Signature, and capital allocation.'
  },
  {
    key: 'q3-2026-10q',
    provider: 'sec-edgar',
    title: 'Costco fiscal 2026 third-quarter Form 10-Q',
    url: 'https://www.sec.gov/Archives/edgar/data/909832/000090983226000051/cost-20260510.htm',
    archetype: 'filing',
    snippet: 'Primary filing for the 36 weeks ended May 10, 2026, including 82.9 million paid members, renewal, membership fees, sales, margins, cash flow, capex, working capital, warehouse count, debt, and liquidity.'
  },
  {
    key: 'costco-company-profile',
    provider: 'costco-official',
    title: 'Costco company profile and membership format',
    url: 'https://investor.costco.com/company-profile/',
    archetype: 'company_product',
    snippet: 'Official company description of the membership warehouse, manufacturing support, Business, Gold Star, and Executive membership value proposition.'
  },
  {
    key: 'costco-executive-membership',
    provider: 'costco-official',
    title: 'Costco Executive Membership terms — March 2026',
    url: 'https://customerservice.costco.com/app/answers/detail/a_id/1205/kw/customer%20service%20contact',
    archetype: 'customer_economics',
    snippet: 'Official terms: $65 base membership, $65 Executive upgrade, 2% qualified-purchase reward, $1,250 cap, satisfaction guarantee, and ancillary service benefits.'
  },
  {
    key: 'costco-june-2026-sales',
    provider: 'costco-investor-relations',
    title: 'Costco June 2026 sales results',
    url: 'https://investor.costco.com/news/news-details/2026/Costco-Wholesale-Corporation-Reports-June-Sales-Results-and-Announces-Quarterly-Cash-Dividend/default.aspx',
    archetype: 'operating_benchmark',
    snippet: 'Official June 2026 sales release: 44-week sales up 10.1%, adjusted comparable sales up 6.7%, digitally enabled adjusted comparable sales up 21.1%, and 933 warehouses.'
  },
  {
    key: 'walmart-2026-annual',
    provider: 'walmart-investor-relations',
    title: 'Walmart fiscal 2026 annual report — Sam’s Club segment',
    url: 'https://stock.walmart.com/_assets/_ef4b3350ef1127ae63b1dd51abb6cf31/walmart/db/950/9988/annual_report/Walmart%2B2026%2BAnnual%2BReport.pdf',
    archetype: 'competitor_primary',
    snippet: 'Competitor primary evidence: Sam’s Club fiscal 2026 net sales of $93.015 billion, membership and other income of $2.525 billion, operating income of $2.442 billion, and 601 clubs.'
  },
  {
    key: 'bjs-2025-10k',
    provider: 'sec-edgar',
    title: 'BJ’s Wholesale Club fiscal 2025 Form 10-K',
    url: 'https://www.sec.gov/Archives/edgar/data/1531152/000153115226000007/bj-20260131.htm',
    archetype: 'competitor_primary',
    snippet: 'Competitor primary evidence: more than 8 million paid memberships, $499.8 million membership fee income, 90% tenured renewal, and $60/$120 membership tiers.'
  },
  {
    key: 'bls-june-2026-cpi',
    provider: 'us-bureau-labor-statistics',
    title: 'U.S. CPI — June 2026',
    url: 'https://www.bls.gov/news.release/cpi.htm?lv=true',
    archetype: 'independent_domain',
    snippet: 'Independent public benchmark: food-at-home prices rose 2.7% over the twelve months ended June 2026; all items rose 3.5%.'
  },
  {
    key: 'cost-market-snapshot',
    provider: 'nasdaq-market-snapshot',
    title: 'COST market snapshot — July 24, 2026',
    url: 'https://www.nasdaq.com/market-activity/stocks/cost',
    archetype: 'market_snapshot',
    snippet: 'Dated market input: COST $935.03 at 23:47:58 UTC on July 24, 2026. This is an expectations input, not a company evidence clock.'
  },
  {
    key: ANALYSIS_WORKBOOK_KEY,
    provider: 'noeis-analysis',
    title: 'Costco reproducible analysis workbook — July 24, 2026',
    url: '',
    archetype: 'analyst_calculation',
    snippet: ANALYSIS_WORKBOOK_SNIPPET,
    evidenceRole: 'analyst_workbook',
    inputSourceKeys: ['fy2025-10k', 'q3-2026-10q', 'costco-june-2026-sales', 'cost-market-snapshot']
  }
]);

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const clone = value => JSON.parse(JSON.stringify(value ?? null));
const pct = value => `${(value * 100).toFixed(1)}%`;
const money = value => `$${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} billion`;
const claim = (idValue, support, sources, text) => ({
  id: idValue,
  support,
  sources,
  text: clean(text)
});

const buildSections = () => ([
  {
    heading: 'Current Judgment',
    claims: [
      claim(
        'cost-judgment-quality-price',
        'partial',
        ['fy2025-10k', 'q3-2026-10q', 'cost-market-snapshot'],
        `Costco is an unusually high-quality retailer and a demanding security at the same time. The operating system converts member trust into high traffic, narrow assortment, purchasing concentration, fast inventory turns, supplier financing, and recurring fee income. Those mechanisms are still strengthening: fiscal 2026 year-to-date operating income rose to $7.884 billion, paid members reached 82.9 million, and the June sales release showed 6.7% adjusted comparable growth through 44 weeks. At $935.03, however, the equity value is approximately ${money(derived.equityValue)} and the price is about ${derived.currentPriceToLtmFcf.toFixed(1)} times a mechanically calculated ${money(derived.ltmFreeCashFlow)} of trailing free cash flow. Business quality is established; an attractive forward return is not.`
      ),
      claim(
        'cost-judgment-control-point',
        'partial',
        ['fy2025-10k', 'costco-company-profile', 'costco-executive-membership'],
        `The scarce control point is not warehouse real estate by itself. It is permission to earn a member’s annual renewal by repeatedly demonstrating a price-and-quality surplus. Membership controls access; fewer than 4,000 active warehouse SKUs concentrate purchases; cross-docking and pallet display remove handling; Kirkland Signature gives Costco a differentiated, higher-margin alternative; and the satisfaction guarantee lowers perceived risk. The result is a loop in which trust produces frequency and volume, volume improves buying terms, and those terms can be reinvested in price. A competitor can copy a fee or a concrete box. Reproducing the loop requires comparable purchasing volume, merchandising judgment, employee execution, and a willingness to leave near-term gross margin with the member.`
      ),
      claim(
        'cost-judgment-owner-boundary',
        'partial',
        ['cost-market-snapshot', 'fy2025-10k'],
        `The owner has not supplied a day-zero Costco judgment, so this page is a research draft rather than a statement of conviction. The provisional research conclusion is narrower: the central investment question is whether member growth, warehouse density, and cash conversion can compound fast enough to overcome a starting free-cash-flow yield of only ${pct(derived.currentFcfYield)} without assuming that a premium terminal multiple persists indefinitely. That distinction matters because admiration for Costco’s operating culture can easily become an excuse to avoid underwriting the price.`
      )
    ]
  },
  {
    heading: 'Implied Expectations',
    claims: [
      claim(
        'cost-valuation-reverse',
        'partial',
        ['fy2025-10k', 'q3-2026-10q', 'cost-market-snapshot'],
        `A simple reverse-expectations model exposes the burden. Fiscal 2025 operating cash flow of $13.335 billion less $5.498 billion of capital expenditure produced ${money(derived.fy2025FreeCashFlow)} of free cash flow. Replacing the prior-year first 36 weeks with fiscal 2026’s first 36 weeks gives a mechanical trailing value of ${money(derived.ltmFreeCashFlow)}; it is not management guidance and retains seasonality and working-capital noise. A 10% annual price return for five years requires roughly ${money(derived.targetEquityValue)} of ending equity value before dividends. At a 30-times terminal free-cash-flow multiple, free cash flow must reach ${money(derived.terminalFcf30x)}, a ${pct(derived.requiredFcfCagr30x)} annual increase. At 35 times, the requirement is ${money(derived.terminalFcf35x)} and ${pct(derived.requiredFcfCagr35x)}; even at 40 times, it is ${money(derived.terminalFcf40x)} and ${pct(derived.requiredFcfCagr40x)}.`
      ),
      claim(
        'cost-valuation-boundaries',
        'partial',
        ['q3-2026-10q', 'cost-market-snapshot'],
        `The model is deliberately austere. It credits no interim dividends, special dividends, buyback shrinkage, or deployment of Costco’s approximately ${money(derived.netCash)} net cash position; those could lower the required operating result. It also assumes that today’s share count survives, ignores acquisition risk, and treats all capital expenditure as economically necessary even though some funds new warehouses. More importantly, the terminal multiples are assumptions rather than facts. A 25-times exit would require ${pct(derived.requiredFcfCagr25x)} annual free-cash-flow growth, while a 40-times exit still requires ${pct(derived.requiredFcfCagr40x)}. The stock therefore needs more than “Costco stays excellent.” It needs sustained low-to-mid-teens cash growth plus continued willingness by future investors to capitalize that cash at an exceptional rate.`
      ),
      claim(
        'cost-valuation-repurchase-test',
        'partial',
        ['fy2025-10k', 'q3-2026-10q', 'cost-market-snapshot'],
        `Capital return does not automatically solve the valuation problem. Costco repurchased 943,000 shares at an average $957.66 in fiscal 2025 and another 638,000 at $945.46 during the first 36 weeks of fiscal 2026. Those prices are close to the current observation and above the simple value implied by many lower terminal-multiple cases. Repurchases create value only if the shares are bought below a defensible estimate of intrinsic value; otherwise they transfer cash into a richly valued security. The observable test is net share-count reduction per dollar spent and the forward cash-flow yield at the purchase price, not the existence of an authorization.`
      )
    ]
  },
  {
    heading: 'Thesis-Changing Questions',
    claims: [
      claim(
        'cost-question-member-surplus',
        'partial',
        ['costco-executive-membership', 'fy2025-10k'],
        `Is the member’s realized surplus widening after the $65 fee and any Executive upgrade? The 2% reward means an Executive member breaks even on the incremental $65 fee at roughly $3,250 of qualified annual purchases before considering other benefits. That arithmetic makes the tier a self-selection device for high-spend households, but it does not prove that Costco’s merchandise basket is cheaper than alternatives. The decisive measurement is a recurring, matched-SKU basket that includes pack-size normalization, membership cost, reward value, delivery fees, fuel savings, stock-outs, and the member’s travel cost. Without that test, “pricing authority” remains a plausible operating philosophy rather than a measured customer advantage.`
      ),
      claim(
        'cost-question-digital-renewal',
        'partial',
        ['q3-2026-10q', 'costco-june-2026-sales'],
        `Can Costco turn digital acquisition into the same lifetime economics as warehouse-originated membership? Digitally enabled adjusted comparable sales grew 21.1% through the June 2026 44-week period, but management says online and digitally promoted memberships renew at slightly lower rates and have pulled reported renewal down to 92.2% in the U.S. and Canada and 89.7% worldwide. Digital growth is valuable only if it expands convenience without degrading renewal, order economics, or the treasure-hunt behavior that supports store productivity. The missing cohort table is renewal, frequency, basket, reward expense, fulfillment cost, and contribution after one and two years by acquisition channel.`
      ),
      claim(
        'cost-question-density',
        'partial',
        ['fy2025-10k', 'q3-2026-10q', 'costco-june-2026-sales'],
        `How far can the warehouse network expand before density turns from advantage into cannibalization? Costco ended fiscal 2025 with 914 warehouses, reached 928 by May 2026 and 933 by July, while planning substantial additional openings. New units increase buying scale and member convenience, but management explicitly warns that openings in existing markets can cannibalize sales and begin with lower profitability. The right test is mature versus new warehouse sales, memberships, contribution, capex and payback by cohort and geography—not the absolute warehouse count. International whitespace is real, but site quality, local purchasing scale and membership culture determine whether it earns Costco-like returns.`
      )
    ]
  },
  {
    heading: 'Product and Technical Moat',
    claims: [
      claim(
        'cost-moat-selection',
        'supported',
        ['fy2025-10k'],
        `Costco’s product architecture is deliberate compression. Fewer than 4,000 active SKUs per warehouse concentrate volume into a small number of fast-selling models, sizes and colors. An average warehouse is approximately 147,000 square feet, uses pallet display and rack storage, runs shorter operating hours than many retailers, and routes merchandise through cross-docking depots or directly from suppliers. Each design choice removes touches, working capital, or assortment complexity. The system gives buyers unusually large demand behind each chosen item and makes poor selection costly: scarcity increases purchasing leverage, but a merchandising miss has fewer substitute SKUs to hide behind.`
      ),
      claim(
        'cost-moat-kirkland',
        'partial',
        ['fy2025-10k'],
        `Kirkland Signature is not merely private-label margin. Costco states that the brand generally earns higher margins, lowers costs, differentiates the assortment, and is expected to increase penetration. It also changes the negotiation boundary with national brands: Costco can remove a branded item, develop an alternative, or use Kirkland as a quality-price reference. The moat is conditional on trust. A product-quality failure would damage both the item and the membership promise because Kirkland carries Costco’s name. The useful metric is category-level Kirkland penetration, repeat, complaint rate, price gap and gross-profit dollars after cannibalization; aggregate private-label growth alone cannot distinguish member value from margin harvesting.`
      ),
      claim(
        'cost-moat-labor',
        'partial',
        ['fy2025-10k'],
        `Labor policy is part of the operating technology. Costco reported approximately 94% retention among U.S. and Canadian employees with at least one year of tenure, an average U.S. hourly rate near $32, and a philosophy of paying above much of the industry to reduce turnover and raise productivity. The mechanism is credible: experienced employees execute high-volume receiving, stocking, checkout, shrink control and member service with less retraining. But the company does not disclose a clean productivity bridge from compensation to sales per labor hour or error reduction. The moat claim should therefore remain partial until wage investment, retention, productivity and member outcomes can be observed together.`
      ),
      claim(
        'cost-moat-convenience',
        'partial',
        ['fy2025-10k', 'costco-june-2026-sales', 'walmart-2026-annual'],
        `Convenience is the most credible substitution vector. Costco’s warehouse experience, fuel stations and treasure hunt encourage physical frequency, while digitally enabled adjusted comparable sales grew 21.1% through the June 2026 44-week period. Sam’s Club can attack the friction with a large club base, digital tools and a membership model funded by $2.525 billion of membership and other income. Costco does not need to match every interface; it must keep the total member surplus high enough that checkout friction, bulk pack sizes and travel time do not outweigh savings and trust. The moat test is share of wallet and renewal among members exposed to faster competing formats, not app feature parity.`
      )
    ]
  },
  {
    heading: 'System and Unit Economics',
    claims: [
      claim(
        'cost-membership-profit-bridge',
        'partial',
        ['fy2025-10k', 'q3-2026-10q'],
        `Membership fees are economically central but should not be mislabeled as pure profit. Fiscal 2025 membership revenue of $5.323 billion was equivalent to ${pct(derived.membershipFeeShareOfOperatingIncome)} of $10.383 billion in operating income; membership acquisition, service and reward costs remain elsewhere in the income statement. Fee revenue divided by year-end paid members was approximately $${derived.membershipRevenuePerPaidMember.toFixed(2)}, close to the base annual fee but affected by geography, member mix, timing and deferred recognition. In fiscal 2026’s first 36 weeks, membership fees grew 13%; management attributed about 35% of that growth to the prior fee increase, implying that roughly ${pct(derived.underlyingMembershipGrowthShare)} came from sign-ups, mix and Executive upgrades rather than price alone.`
      ),
      claim(
        'cost-unit-executive-density',
        'partial',
        ['fy2025-10k', 'costco-executive-membership'],
        `Executive membership reveals customer density. Executive members were 38.7 million of 81.0 million paid members at fiscal 2025 year-end, or ${pct(derived.executiveMemberShare)}, but represented 73.6% of worldwide net sales. Treating those stocks and sales shares as comparable produces an approximate Executive-to-non-Executive spend ratio of ${derived.executiveToNonExecutiveSpendRatio.toFixed(1)} times. It is not a cohort result: Business affiliates, timing and household cards complicate the denominator. Still, it explains why upgrades matter beyond the additional fee. The 2% reward makes the highest-spend members more likely to consolidate purchases at Costco, while their volume strengthens Costco’s buying economics.`
      ),
      claim(
        'cost-unit-turns',
        'partial',
        ['fy2025-10k'],
        `The merchandise engine converts limited assortment into working-capital speed. Fiscal 2025 merchandise cost divided by average 2024–2025 inventory implies approximately ${derived.inventoryTurns.toFixed(1)} inventory turns, or ${derived.inventoryDays.toFixed(1)} days of inventory. Year-end accounts payable represented roughly ${derived.payableDays.toFixed(1)} days of merchandise cost. The calculation supports management’s statement that Costco often sells inventory before suppliers must be paid: payable days modestly exceeded inventory days, and payables exceeded inventory by ${money(derived.fy2025SupplierFunding)}. The metric is approximate because purchases differ from cost of goods sold and year-end balances are snapshots, but it identifies the mechanism that lets low merchandise margins coexist with attractive cash generation.`
      ),
      claim(
        'cost-warehouse-productivity',
        'partial',
        ['fy2025-10k'],
        `Scale is valuable only when expressed through productive boxes. Fiscal 2025 net sales divided by 914 year-end warehouses was about $${derived.salesPerWarehouse.toFixed(1)} million per warehouse; divided by 134.7 million operating square feet, it was approximately $${derived.salesPerSquareFoot.toFixed(0)} per square foot. These are rough system averages, not same-store cohort economics, because openings occur through the year and e-commerce is allocated into merchandise categories. They nevertheless show why warehouse throughput matters more than store count: each site carries enough volume to support concentrated purchasing, low handling expense, ancillary traffic drivers and a membership relationship.`
      )
    ]
  },
  {
    heading: 'Operating Engine and Capital Allocation',
    claims: [
      claim(
        'cost-operating-price-investment',
        'partial',
        ['fy2025-10k', 'q3-2026-10q'],
        `Costco’s low-margin model makes restraint measurable. Fiscal 2025 gross margin was 11.12% and SG&A was 9.25% of net sales. On $269.9 billion of sales, ten basis points of price investment or cost slippage equals roughly $270 million, about ${pct(derived.tenBasisPointOperatingIncomeShare)} of operating income. Management explicitly treats holding prices through cost increases as a near-term gross-margin sacrifice that can preserve pricing authority. That is the strategic bargain: Costco can reinvest some scale benefit in the member, but small execution errors also have material profit effects. The correct signal is renewal, traffic and unit share after price investment—not margin expansion in isolation.`
      ),
      claim(
        'cost-working-capital-float',
        'partial',
        ['fy2025-10k', 'q3-2026-10q'],
        `Recent cash flow contains a useful but non-repeatable component. At fiscal 2025 year-end, accounts payable exceeded inventory by ${money(derived.fy2025SupplierFunding)}; by May 2026 the gap had widened to ${money(derived.q3SupplierFunding)}, an increase of ${money(derived.supplierFundingIncrease)}. The 36-week cash-flow statement separately shows a $1.240 billion inventory use offset by a $2.498 billion payable source. Faster turns and improved terms can represent genuine operating improvement, but the balance cannot expand faster than merchandise indefinitely. Normalized free cash flow should therefore distinguish profit growth from temporary working-capital financing rather than capitalizing the entire recent cash conversion at a premium multiple.`
      ),
      claim(
        'cost-capital-new-warehouses',
        'partial',
        ['q3-2026-10q', 'fy2025-10k'],
        `Capital expenditure is both maintenance and growth. Costco spent $5.498 billion in fiscal 2025 and $4.228 billion in the first 36 weeks of fiscal 2026, with a current fiscal 2026 plan near $6.5 billion for new and remodeled warehouses, depots, information systems and digital operations. A free-cash-flow calculation that deducts all capex is conservative for current earning power but can understate value when new warehouses earn high incremental returns. The missing disclosure is cohort economics: land and build cost, pre-opening expense, member acquisition, cannibalization, mature sales, margin and cash payback by geography. Until that exists, warehouse growth should be underwritten as a capital claim, not counted as free optionality.`
      ),
      claim(
        'cost-operating-comp-vs-inflation',
        'partial',
        ['costco-june-2026-sales', 'bls-june-2026-cpi'],
        `The June evidence suggests operating growth exceeded grocery inflation, but not by a clean amount. Costco reported 6.7% adjusted comparable sales growth for the first 44 weeks of fiscal 2026 and 21.1% digitally enabled adjusted growth. The BLS food-at-home index rose 2.7% over the twelve months ended June. The gap is consistent with traffic, share gains, non-food mix and new digital behavior rather than price alone. It is not a same-basket volume calculation: Costco sells fuel, non-foods, services and international goods, and the periods differ. A rigorous bridge requires units or category volumes, which Costco does not disclose.`
      )
    ]
  },
  {
    heading: 'Obligations, Concentration, and Policy',
    claims: [
      claim(
        'cost-risk-geography',
        'supported',
        ['fy2025-10k'],
        `Geographic concentration remains material. U.S. and Canadian operations generated 86% of fiscal 2025 net sales and 84% of operating income, while California alone represented 26% of U.S. sales. High-volume California warehouses are an asset, but the concentration increases exposure to local labor, land, energy, tax and regulatory changes. International growth diversifies the base but introduces currency, sourcing, local competition and execution risk. The dossier should track operating income and new-unit returns by geography, not merely global warehouse additions.`
      ),
      claim(
        'cost-risk-competition',
        'partial',
        ['walmart-2026-annual', 'bjs-2025-10k', 'fy2025-10k'],
        `The membership model is not proprietary. Sam’s Club reported $93.015 billion of fiscal 2026 net sales, $2.525 billion of membership and other income, $2.442 billion of operating income and 601 clubs. BJ’s reported more than 8 million paid memberships, $499.8 million of fee income and a 90% tenured renewal rate. Costco’s scale, renewal and warehouse productivity are larger, but competitor fee income can subsidize price and convenience in the same way. The defensible edge is the depth of Costco’s member trust and purchasing loop, not exclusivity of the format.`
      ),
      claim(
        'cost-risk-margin-and-rewards',
        'partial',
        ['fy2025-10k', 'q3-2026-10q'],
        `Rewards, wages, tariffs and ancillary mix all sit inside a narrow margin envelope. Executive rewards reduced fiscal 2025 sales by $3.007 billion. Higher wages may support retention and productivity but raise SG&A if productivity does not follow. Tariffs and supplier costs create a choice between passing price to members and absorbing it. Gasoline and digital sales can increase traffic while mechanically lowering reported margin percentages. These are not generic risks; they are tests of whether Costco can preserve member value without allowing the economic subsidy required to sustain it to outrun fee and volume growth.`
      )
    ]
  },
  {
    heading: 'What Would Change the Thesis',
    claims: [
      claim(
        'cost-falsifier-price-gap',
        'partial',
        ['costco-company-profile', 'costco-executive-membership'],
        `Weaken the moat judgment if a repeated matched-basket study shows Costco’s all-in member savings—after pack normalization, fee, reward, delivery, travel and waste—falling below credible alternatives for the high-frequency categories that drive renewal. Strengthen it if the measured gap persists across geographies while renewal and frequency remain high. This is the most important missing product evidence because management’s pricing-authority claim is otherwise evaluated indirectly through behavior.`
      ),
      claim(
        'cost-falsifier-renewal-cohorts',
        'partial',
        ['q3-2026-10q'],
        `Weaken the thesis if U.S./Canada renewal falls below 90% for reasons other than a disclosed mix shift, if digitally acquired cohorts fail to converge toward warehouse-originated retention, or if Executive penetration rises while reward expense grows faster than incremental member economics. Strengthen it if online cohorts mature into comparable renewal, frequency and contribution. Aggregate membership growth can conceal weak cohort quality, so the evidence must separate acquisition channel and tenure.`
      ),
      claim(
        'cost-falsifier-valuation',
        'partial',
        ['cost-market-snapshot', 'fy2025-10k', 'q3-2026-10q'],
        `Change the security judgment with the relationship between normalized cash and price. At the current market value, a five-year 10% price return requires roughly ${pct(derived.requiredFcfCagr35x)} annual free-cash-flow growth even with a 35-times exit. A materially lower price, demonstrably higher normalized cash base, or evidence that new warehouses can compound at exceptional incremental returns would improve expected return. Conversely, single-digit normalized cash growth combined with a terminal multiple below 30 times would make the current valuation difficult to defend even if the company remains excellent.`
      )
    ]
  },
  {
    heading: 'Next Evidence and Maintenance Test',
    claims: [
      claim(
        'cost-next-q4',
        'partial',
        ['q3-2026-10q', 'costco-june-2026-sales'],
        `The next company clock is Costco’s fiscal 2026 fourth-quarter and full-year release scheduled for September 24, 2026, followed by the 10-K. Rebuild the free-cash-flow bridge with full-year operating cash flow and capex; separate working-capital contribution; update paid members, Executive mix, renewal, warehouse count, comparable sales, gross margin and SG&A; and compare fee growth attributable to price versus sign-ups and upgrades. The judgment should change only if those mechanisms change, not because the filing is new.`
      ),
      claim(
        'cost-next-customer-test',
        'partial',
        ['costco-executive-membership', 'walmart-2026-annual', 'bjs-2025-10k'],
        `The next domain clock is a reproducible customer-value audit. Price a fixed basket of at least 100 high-frequency items at Costco, Sam’s Club, BJ’s and one mass or grocery alternative; normalize unit quantities and quality; include stock-outs, membership, rewards, fulfillment and travel; and repeat monthly. Pair the basket with a convenience audit covering checkout, pickup, delivery and return friction. This converts “pricing authority” from management language into a falsifiable moat measure.`
      ),
      claim(
        'cost-next-market-test',
        'partial',
        ['cost-market-snapshot', 'fy2025-10k'],
        `The expectations clock should refresh price and diluted shares separately from the filing clock. Recalculate equity value, net cash, trailing and normalized free cash flow, current yield, and required five-year cash growth at 25-, 30-, 35- and 40-times terminal values. Record dividends and actual net share-count change rather than assuming them. A price move alone changes the security burden; it does not prove that membership economics or the moat improved.`
      )
    ]
  }
]);

const headingNode = text => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }]
});
const paragraphNode = ({ text, claimId, support, citationIndexes }) => ({
  type: 'paragraph',
  content: [{
    type: 'text',
    text,
    marks: [{
      type: 'claim',
      attrs: {
        claimId,
        support,
        citationIndexes,
        contradictionIndexes: []
      }
    }]
  }]
});
const nodeText = node => clean((node?.content || []).map(child => child?.text || '').join(''));

const sourceKey = source => clean(source?.metadata?.evidenceKey || '').toLowerCase();

const ensureSources = ({ candidate, now }) => {
  candidate.sourceRefs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
  candidate.citations = Array.isArray(candidate.citations) ? candidate.citations : [];
  const map = new Map();
  candidate.sourceRefs.forEach((source, index) => {
    const key = sourceKey(source);
    if (!key) return;
    let citation = candidate.citations.find(row => id(row.sourceRefId) === id(source._id));
    if (!citation) {
      citation = {
        _id: new mongoose.Types.ObjectId(),
        sourceRefId: source._id,
        sourceType: source.type || 'external',
        sourceTitle: source.title,
        quote: source.snippet || '',
        url: source.url || '',
        confidence: 0.9,
        createdAt: now
      };
      candidate.citations.push(citation);
    }
    map.set(key, { source, citation, index: index + 1 });
  });
  let added = 0;
  SOURCES.forEach((row) => {
    if (map.has(row.key)) return;
    const source = {
      _id: new mongoose.Types.ObjectId(),
      type: 'external',
      objectId: null,
      title: row.title,
      snippet: row.snippet,
      url: row.url,
      citationLabel: row.key.toUpperCase(),
      provider: row.provider,
      metadata: {
        evidenceKey: row.key,
        evidenceArchetype: row.archetype,
        evidenceRole: row.evidenceRole || 'external_evidence',
        inputSourceKeys: row.inputSourceKeys || [],
        analystGenerated: row.evidenceRole === 'analyst_workbook',
        reviewedAt: now,
        asOf: RESEARCH_AS_OF,
        researchRevision: true,
        maintenanceClockEligible: false
      },
      addedBy: 'ai',
      createdAt: now
    };
    const citation = {
      _id: new mongoose.Types.ObjectId(),
      sourceRefId: source._id,
      sourceType: 'external',
      sourceTitle: source.title,
      quote: row.snippet,
      url: row.url,
      confidence: row.key === 'cost-market-snapshot' ? 0.85 : 0.94,
      createdAt: now
    };
    candidate.sourceRefs.push(source);
    candidate.citations.push(citation);
    map.set(row.key, { source, citation, index: candidate.sourceRefs.length });
    added += 1;
  });
  return { map, added };
};

const moduleClaimMap = Object.freeze({
  current_judgment: ['cost-judgment-quality-price', 'cost-judgment-owner-boundary'],
  customer_value_unit: ['cost-question-member-surplus', 'cost-unit-executive-density'],
  control_point_moat: ['cost-judgment-control-point', 'cost-moat-selection', 'cost-moat-kirkland'],
  unit_economics_cash_conversion: ['cost-membership-profit-bridge', 'cost-unit-turns', 'cost-warehouse-productivity'],
  capital_reinvestment: ['cost-capital-new-warehouses', 'cost-valuation-repurchase-test'],
  competitive_substitution: ['cost-moat-convenience', 'cost-risk-competition'],
  reverse_expectations: ['cost-valuation-reverse', 'cost-valuation-boundaries'],
  falsifiers: ['cost-falsifier-price-gap', 'cost-falsifier-renewal-cohorts', 'cost-falsifier-valuation'],
  next_evidence_clock: ['cost-next-q4', 'cost-next-customer-test', 'cost-next-market-test'],
  membership_economics: ['cost-membership-profit-bridge', 'cost-unit-executive-density'],
  merchandise_value_gap: ['cost-question-member-surplus', 'cost-falsifier-price-gap'],
  inventory_working_capital: ['cost-unit-turns', 'cost-working-capital-float'],
  warehouse_density: ['cost-question-density', 'cost-warehouse-productivity', 'cost-capital-new-warehouses']
});

const applyResearch = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  const { map, added } = ensureSources({ candidate, now });
  const sections = buildSections();
  const lead = claim(
    'cost-investor-brief',
    'partial',
    ['fy2025-10k', 'q3-2026-10q', 'cost-market-snapshot'],
    `Costco’s moat is a member-surplus flywheel, not simply a recurring fee. A narrow assortment and high warehouse throughput concentrate purchasing power; fast turns and supplier terms fund low merchandise margins; trusted private label, employee execution and ancillary convenience reinforce renewal; and renewal makes the next cycle cheaper. The business evidence is strong. The stock evidence is harder: at $935.03, a mechanically calculated ${pct(derived.currentFcfYield)} trailing free-cash-flow yield requires sustained cash compounding and a still-premium terminal valuation.`
  );
  const allClaims = [lead, ...sections.flatMap(section => section.claims)];
  const claims = allClaims.map((row) => {
    const evidenceKeys = /\d/.test(row.text)
      ? [...row.sources, ANALYSIS_WORKBOOK_KEY]
      : row.sources;
    const evidence = evidenceKeys.map(key => map.get(key));
    if (evidence.some(item => !item?.source || !item?.citation)) {
      throw new Error(`Missing evidence for ${row.id}: ${evidenceKeys.join(', ')}`);
    }
    const section = row === lead
      ? 'Investor brief'
      : sections.find(candidateSection => candidateSection.claims.includes(row))?.heading || '';
    return {
      claimId: row.id,
      text: row.text,
      section,
      support: row.support,
      citationIds: evidence.map(item => item.citation._id),
      sourceRefIds: evidence.map(item => item.source._id),
      contradictedByCitationIds: [],
      confidence: row.support === 'supported' ? 0.94 : 0.78,
      epistemicStatus: row.support === 'supported' ? 'established_fact' : 'supported_interpretation',
      materiality: ['Investor brief', 'Current Judgment', 'Implied Expectations'].includes(section) ? 'critical' : 'major',
      implication: '',
      falsifierIds: section === 'What Would Change the Thesis' ? [row.id] : [],
      lastReviewedAt: now,
      lastVerifiedAt: now,
      history: [{
        at: now,
        event: 'created',
        support: row.support,
        text: row.text,
        section,
        citationIds: evidence.map(item => item.citation._id),
        sourceRefIds: evidence.map(item => item.source._id),
        summary: 'Added through the Costco decision-dossier research compiler.'
      }],
      createdAt: now
    };
  });
  const body = [];
  const leadEvidence = lead.sources.map(key => map.get(key));
  const leadRenderedEvidence = /\d/.test(lead.text)
    ? [...leadEvidence, map.get(ANALYSIS_WORKBOOK_KEY)]
    : leadEvidence;
  body.push(paragraphNode({
    text: lead.text,
    claimId: lead.id,
    support: lead.support,
    citationIndexes: leadRenderedEvidence.map(item => item.index)
  }));
  sections.forEach((section) => {
    body.push(headingNode(section.heading));
    section.claims.forEach((row) => {
      const evidenceKeys = /\d/.test(row.text)
        ? [...row.sources, ANALYSIS_WORKBOOK_KEY]
        : row.sources;
      const evidence = evidenceKeys.map(key => map.get(key));
      body.push(paragraphNode({
        text: row.text,
        claimId: row.id,
        support: row.support,
        citationIndexes: evidence.map(item => item.index)
      }));
    });
  });

  candidate.body = { type: 'doc', content: body };
  candidate.plainText = body.map(nodeText).filter(Boolean).join('\n\n');
  candidate.claims = claims;
  candidate.sourceScope = 'selected_sources';
  const compilerCreatedJudgment = candidate.judgment;
  const isEmptyCompilerJudgment = Boolean(
    compilerCreatedJudgment?.kind
    && !clean(compilerCreatedJudgment.currentJudgment)
    && compilerCreatedJudgment.governingQuestion === 'Can Costco compound owner value above a 10% annual hurdle over five years from the current price?'
    && !compilerCreatedJudgment.initialRevisionId
    && !(compilerCreatedJudgment.assumptions || []).length
    && !(compilerCreatedJudgment.unknowns || []).length
    && !(compilerCreatedJudgment.falsifiers || []).length
    && !(compilerCreatedJudgment.decisions || []).length
  );
  if (isEmptyCompilerJudgment) delete candidate.judgment;
  const baseProfile = candidate.investmentDossier || buildInvestmentDossierProfile({
    companyName: 'Costco Wholesale Corporation',
    cik: '0000909832',
    ticker: 'COST',
    startingJudgment: 'Owner judgment not yet supplied; this remains a research draft.',
    requiredReturn: INPUTS.requiredReturn,
    horizonYears: INPUTS.horizonYears,
    now
  });
  const allSourceIds = candidate.sourceRefs.map(source => id(source._id)).filter(Boolean);
  candidate.investmentDossier = completeResearchPlan({
    profile: {
      ...baseProfile,
      startingJudgment: 'Owner judgment not yet supplied; this remains a research draft.',
      valuation: buildValuationSnapshot({
        asOf: RESEARCH_AS_OF,
        currency: 'USD',
        unitScale: 'billions',
        price: INPUTS.price,
        dilutedShares: INPUTS.shares / 1e9,
        netCashOrDebt: -derived.netCash,
        operatingBase: {
          metric: 'mechanical_trailing_free_cash_flow',
          period: 'Trailing period through May 10, 2026',
          value: derived.ltmFreeCashFlow,
          derivation: 'FY2025 FCF less first-36-weeks FY2025 FCF plus first-36-weeks FY2026 FCF',
          sourceRefIds: [id(map.get('fy2025-10k').source._id), id(map.get('q3-2026-10q').source._id)]
        },
        annualReturn: INPUTS.requiredReturn,
        horizonYears: INPUTS.horizonYears,
        terminalMultiples: [25, 30, 35, 40],
        sourceRefIds: [
          id(map.get('fy2025-10k').source._id),
          id(map.get('q3-2026-10q').source._id),
          id(map.get('cost-market-snapshot').source._id)
        ],
        calculatedAt: now
      }),
      clocks: {
        ...(baseProfile.clocks || {}),
        domainEvidenceAcceptedAt: RESEARCH_AS_OF,
        priceRefreshedAt: RESEARCH_AS_OF
      }
    },
    businessModel: 'membership_retail',
    evidenceArchetypes: Array.from(new Set(SOURCES.map(source => source.archetype))),
    modules: Object.entries(moduleClaimMap).map(([moduleId, claimIds]) => ({
      id: moduleId,
      status: 'complete',
      claimIds,
      calculationIds: moduleId === 'reverse_expectations'
        ? ['cost-reverse-expectations-v1']
        : moduleId === 'unit_economics_cash_conversion'
          ? ['cost-membership-density-v1', 'cost-inventory-turns-v1']
          : [],
      sourceRefIds: allSourceIds
    })),
    insights: [{
      id: 'cost-executive-density',
      text: `Executive members were ${pct(derived.executiveMemberShare)} of paid members but drove 73.6% of sales, implying roughly ${derived.executiveToNonExecutiveSpendRatio.toFixed(1)} times the spend of non-Executive members.`,
      reproducible: true,
      sourceRefIds: [id(map.get('fy2025-10k').source._id)]
    }, {
      id: 'cost-supplier-funding',
      text: `The payables-minus-inventory funding gap widened by ${money(derived.supplierFundingIncrease)} between fiscal 2025 year-end and May 2026, improving cash conversion but not representing repeatable earnings.`,
      reproducible: true,
      sourceRefIds: [id(map.get('fy2025-10k').source._id), id(map.get('q3-2026-10q').source._id)]
    }, {
      id: 'cost-valuation-burden',
      text: `At a 35-times terminal free-cash-flow multiple, a 10% five-year price return requires approximately ${pct(derived.requiredFcfCagr35x)} annual growth from the mechanical trailing cash base.`,
      reproducible: true,
      sourceRefIds: [
        id(map.get('fy2025-10k').source._id),
        id(map.get('q3-2026-10q').source._id),
        id(map.get('cost-market-snapshot').source._id)
      ]
    }],
    now
  });
  candidate.freshness = {
    ...(candidate.freshness || {}),
    status: 'fresh',
    lastMaintainedAt: now
  };
  candidate.aiState = {
    ...(candidate.aiState || {}),
    draftStatus: 'ready',
    lastDraftedAt: now,
    maintenanceSummary: 'Built Costco with the membership-retail adapter: member surplus, renewal, Executive density, assortment compression, inventory turns, supplier funding, warehouse productivity, reverse expectations, and explicit customer-value tests.',
    candidateStatus: 'promoted',
    changeLog: [{
      id: `costco-decision-dossier-${now.toISOString()}`,
      type: 'research_revision',
      title: 'Costco decision dossier',
      text: 'Compiled a decision-grade membership-retail dossier from free primary filings, product terms, competitor filings, an independent inflation benchmark, and a dated market input.',
      sourceRefIds: allSourceIds,
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, addedSourceCount: added, addedClaimCount: claims.length };
};

const strictValidate = (candidate) => {
  const quality = evaluateWikiArticleQuality({
    page: candidate,
    body: candidate.body,
    claims: candidate.claims,
    sourceRefs: candidate.sourceRefs,
    now: RESEARCH_AS_OF
  });
  const failures = [...quality.failures];
  const words = clean(candidate.plainText).split(/\s+/).filter(Boolean).length;
  if (!candidate.plainText.includes('member-surplus flywheel')) failures.push('Missing member-surplus mechanism.');
  if (!candidate.plainText.includes('matched-SKU basket')) failures.push('Missing matched-basket product test.');
  if (!candidate.plainText.includes('supplier financing')) failures.push('Missing working-capital mechanism.');
  if (!candidate.plainText.includes('Executive-to-non-Executive spend ratio')) {
    failures.push('Missing Executive-member density calculation.');
  }
  if (candidate.plainText.includes('GPU') || candidate.plainText.includes('workload economics')) {
    failures.push('AI-infrastructure vocabulary leaked into membership-retail analysis.');
  }
  return {
    ok: failures.length === 0,
    failures,
    metrics: {
      words,
      sources: candidate.sourceRefs.length,
      claims: candidate.claims.length,
      quality: quality.metrics
    }
  };
};

const ensureOutputDir = () => fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const writeJson = (name, payload) => {
  ensureOutputDir();
  const target = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
};

const buildNewPage = ({ userId, now }) => ({
  _id: new mongoose.Types.ObjectId(),
  userId,
  title: 'Costco Wholesale investment dossier',
  slug: 'costco-wholesale-investment-dossier',
  pageType: 'entity',
  status: 'draft',
  visibility: 'private',
  sourceScope: 'selected_sources',
  createdFrom: {
    type: 'wiki_index',
    objectIds: [],
    text: 'Owner judgment not yet supplied; this remains a research draft.',
    label: 'company-dossier:COST'
  },
  body: { type: 'doc', content: [] },
  plainText: '',
  sourceRefs: [],
  claims: [],
  citations: [],
  investmentDossier: buildInvestmentDossierProfile({
    companyName: 'Costco Wholesale Corporation',
    cik: '0000909832',
    ticker: 'COST',
    startingJudgment: 'Owner judgment not yet supplied; this remains a research draft.',
    requiredReturn: INPUTS.requiredReturn,
    horizonYears: INPUTS.horizonYears,
    now
  }),
  externalWatches: {
    edgar: {
      ticker: 'COST',
      cik: '0000909832',
      companyName: 'Costco Wholesale Corporation',
      forms: ['10-K', '10-Q'],
      status: 'active'
    }
  },
  freshness: {},
  aiState: {},
  createdAt: now,
  updatedAt: now
});

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const referencePage = await WikiPage.findById(REFERENCE_PAGE_ID);
  if (!referencePage) throw new Error(`Owner reference page ${REFERENCE_PAGE_ID} was not found.`);
  let page = await WikiPage.findOne({
    userId: referencePage.userId,
    archived: { $ne: true },
    $or: [
      { 'externalWatches.edgar.ticker': 'COST' },
      { 'createdFrom.label': 'company-dossier:COST' }
    ]
  });
  const now = new Date();
  const newPage = !page;
  const input = page
    ? page.toObject({ virtuals: false })
    : buildNewPage({ userId: referencePage.userId, now });
  const before = page ? snapshotPage(page) : null;
  const result = applyResearch({ page: input, now });
  const validation = strictValidate(result.candidate);
  const preview = {
    apply: APPLY,
    newPage,
    pageId: id(result.candidate._id),
    title: result.candidate.title,
    addedSourceCount: result.addedSourceCount,
    addedClaimCount: result.addedClaimCount,
    validation
  };
  writeJson('preview.json', preview);
  writeJson('candidate.json', result.candidate);
  if (!validation.ok) {
    throw new Error(`Costco decision dossier failed: ${validation.failures.join(' | ')}`);
  }
  if (!APPLY) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  if (!page) page = new WikiPage(result.candidate);
  else {
    Object.entries(result.candidate).forEach(([key, value]) => {
      if (['_id', 'id', 'userId', 'createdAt', 'updatedAt', '__v'].includes(key)) return;
      page[key] = clone(value);
      page.markModified(key);
    });
  }
  page.aiState.quality = validation.metrics.quality;
  page.markModified('aiState');
  await page.save();
  const event = new WikiSourceEvent({
    userId: page.userId,
    sourceType: 'external',
    provider: 'costco-decision-dossier-compiler',
    externalId: `costco-decision-dossier:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated',
    title: 'Costco membership-retail research review',
    summary: 'Free filings, official membership terms, competitor filings, public inflation data, and a dated market input were compiled into the membership-retail dossier contract.',
    text: 'The review added member-surplus, Executive density, inventory-turn, supplier-funding, warehouse-productivity, competitor, reverse-expectations, falsifier, and next-evidence modules.',
    url: SOURCES.find(row => row.key === 'fy2025-10k').url,
    sourceUpdatedAt: RESEARCH_AS_OF,
    status: 'processed',
    affectedPageIds: [page._id],
    processedAt: now,
    metadata: {
      source: 'costco-decision-dossier-compiler',
      sourceUrls: SOURCES.map(row => row.url),
      researchRevision: true,
      maintenanceClockEligible: false,
      asOf: RESEARCH_AS_OF
    }
  });
  await event.save();
  const revision = await createWikiRevision({
    WikiRevision,
    userId: page.userId,
    page,
    before,
    reason: newPage ? 'created' : 'agent_candidate',
    actorType: 'agent',
    sourceEventId: event._id,
    promotionStatus: 'promoted',
    quality: page.aiState.quality,
    summary: 'Built the Costco membership-retail decision dossier under the version-2 research contract.'
  });
  writeJson('applied.json', {
    ...preview,
    pageId: id(page._id),
    eventId: id(event._id),
    revisionId: id(revision?._id),
    workspaceUrl: `https://www.noeis.io/wiki/workspace?page=${id(page._id)}`
  });
  console.log(JSON.stringify({
    ...preview,
    pageId: id(page._id),
    eventId: id(event._id),
    revisionId: id(revision?._id),
    workspaceUrl: `https://www.noeis.io/wiki/workspace?page=${id(page._id)}`
  }, null, 2));
};

if (require.main === module) {
  main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error(error.stack || error.message);
      try { await mongoose.disconnect(); } catch (_error) {}
      process.exit(1);
    });
}

module.exports = {
  INPUTS,
  RESEARCH_AS_OF,
  SOURCES,
  applyResearch,
  buildSections,
  derived,
  strictValidate
};
