#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');

const PAGE_ID = process.env.COREWEAVE_DOSSIER_PAGE_ID || '6a62aa71a5153ffa3255d6de';
const OUTPUT_DIR = path.resolve(
  process.env.COREWEAVE_DOSSIER_OUTPUT
    || path.join(process.cwd(), 'output', 'coreweave-decision-dossier-2026-07-24')
);
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const RESEARCH_AS_OF = new Date('2026-07-24T09:31:29.000Z');

const INPUTS = Object.freeze({
  price: 81.10,
  classAShares: 447_573_939,
  classBShares: 97_996_407,
  debt: 24_859,
  cashAndSecurities: 2_266,
  operatingLeaseLiabilities: 10_050,
  q1Revenue: 2_078,
  fy2025Revenue: 5_100,
  q1OperatingCashFlow: 2_984,
  q1Capex: 7_695,
  q1WorkingCapitalContribution: 2_016,
  q1InterestExpense: 536,
  q1GrossProfitProxy: 1_362,
  q1Depreciation: 1_147,
  propertyAndEquipmentNet: 36_424,
  rpo: 98_800,
  rpoFirst24MonthsPct: 0.36,
  rpoMonths25To48Pct: 0.39,
  requiredReturn: 0.10,
  horizonYears: 5
});

const derived = Object.freeze((() => {
  const shares = INPUTS.classAShares + INPUTS.classBShares;
  const equityValue = INPUTS.price * shares / 1e9;
  const netDebt = (INPUTS.debt - INPUTS.cashAndSecurities) / 1e3;
  const targetEquityValue = equityValue * ((1 + INPUTS.requiredReturn) ** INPUTS.horizonYears);
  const terminalEnterpriseValue = targetEquityValue + netDebt;
  const requiredRevenue = terminalMultiple => terminalEnterpriseValue / terminalMultiple;
  const requiredRevenueCagr = terminalMultiple => (
    (requiredRevenue(terminalMultiple) / (INPUTS.fy2025Revenue / 1e3)) ** (1 / INPUTS.horizonYears) - 1
  );
  return {
    shares,
    equityValue,
    netDebt,
    debtAndLeaseClaimsNetOfCash: netDebt + INPUTS.operatingLeaseLiabilities / 1e3,
    targetEquityValue,
    terminalEnterpriseValue,
    requiredRevenue4x: requiredRevenue(4),
    requiredRevenue6x: requiredRevenue(6),
    requiredRevenue8x: requiredRevenue(8),
    requiredRevenueCagr4x: requiredRevenueCagr(4),
    requiredRevenueCagr6x: requiredRevenueCagr(6),
    requiredRevenueCagr8x: requiredRevenueCagr(8),
    q1FreeCashFlow: INPUTS.q1OperatingCashFlow - INPUTS.q1Capex,
    workingCapitalShareOfOcf: INPUTS.q1WorkingCapitalContribution / INPUTS.q1OperatingCashFlow,
    capexToRevenue: INPUTS.q1Capex / INPUTS.q1Revenue,
    interestToGrossProfit: INPUTS.q1InterestExpense / INPUTS.q1GrossProfitProxy,
    rpoFirst24Months: INPUTS.rpo * INPUTS.rpoFirst24MonthsPct / 1e3,
    rpoMonths25To48: INPUTS.rpo * INPUTS.rpoMonths25To48Pct / 1e3,
    rpoMonths49To84: INPUTS.rpo * (1 - INPUTS.rpoFirst24MonthsPct - INPUTS.rpoMonths25To48Pct) / 1e3,
    mlperfGpuMinutes2048: 2_048 * 5.54,
    mlperfGpuMinutes4096: 4_096 * 3.09,
    mlperfGpuMinutes8192: 8_192 * 2.02,
    mlperfTimeReduction: 1 - 2.02 / 5.54,
    mlperfGpuMinuteIncrease: (8_192 * 2.02) / (2_048 * 5.54) - 1,
    mlperfStrongScalingEfficiency: (5.54 / 2.02) / 4,
    h100OnDemandPerGpuHour: 49.24 / 8,
    h100SpotPerGpuHour: 19.71 / 8,
    h100SpotDiscount: 1 - 19.71 / 49.24,
    h200OnDemandPerGpuHour: 50.44 / 8,
    b200OnDemandPerGpuHour: 68.80 / 8
  };
})());

const SOURCES = Object.freeze([
  {
    key: 'price-snapshot',
    provider: 'nasdaq-market-snapshot',
    type: 'dated_market_input',
    title: 'CRWV market snapshot — July 24, 2026',
    url: 'https://www.nasdaq.com/market-activity/stocks/crwv',
    snippet: 'CRWV price observation of $81.10 at 09:31:29 UTC on July 24, 2026. This is a dated expectations input, not a company evidence clock.'
  },
  {
    key: 'coreweave-security-architecture',
    provider: 'coreweave-official',
    type: 'primary_technical_documentation',
    title: 'CoreWeave security and network architecture',
    url: 'https://docs.coreweave.com/security/architecture',
    snippet: 'Official architecture documentation for bare-metal Kubernetes, Clos networking, EVPN and VXLAN isolation, BlueField-3 DPU offload, Cilium, observability, and workload identity.'
  },
  {
    key: 'coreweave-cks',
    provider: 'coreweave-official',
    type: 'primary_technical_documentation',
    title: 'CoreWeave Kubernetes Service cluster architecture',
    url: 'https://docs.coreweave.com/products/cks/clusters/introduction',
    snippet: 'Official documentation describing bare-metal Kubernetes clusters, managed control and data planes, VPC isolation, reserved node pools, low-level observability, and customer control.'
  },
  {
    key: 'coreweave-pricing',
    provider: 'coreweave-official',
    type: 'dated_public_pricing',
    title: 'CoreWeave Cloud public pricing — July 24, 2026 review',
    url: 'https://www.coreweave.com/pricing',
    snippet: 'Public North America list prices for H100, H200, B200, on-demand and spot instances. List prices do not reveal negotiated contract economics or matched workload cost.'
  },
  {
    key: 'coreweave-capacity-plans',
    provider: 'coreweave-official',
    type: 'primary_product_documentation',
    title: 'CoreWeave capacity plans and billing attribution',
    url: 'https://docs.coreweave.com/platform/capacity-plans',
    snippet: 'Official documentation explaining Reserved Instance, Flex holding plus usage, On-Demand overage, Spot capacity, 30-second attribution, and invoice treatment.'
  },
  {
    key: 'coreweave-b200',
    provider: 'coreweave-official',
    type: 'primary_product_specification',
    title: 'CoreWeave B200 InfiniBand instance specification',
    url: 'https://docs.coreweave.com/platform/instances/gpu/b200-8x',
    snippet: 'Official eight-GPU B200 instance specification with NVLink, BlueField-3 DPU, eight ConnectX-7 HCAs, and a 400G NDR non-blocking Quantum-2 InfiniBand fabric.'
  },
  {
    key: 'mlperf-training-v6',
    provider: 'mlcommons',
    type: 'independent_benchmark_record',
    title: 'MLPerf Training v6.0 supplemental results discussion',
    url: 'https://mlcommons.org/wp-content/uploads/2026/06/Final-MLPerf-Training-v6.0-Supplemental-Discussion-UNDER-EMBARGO-UNTIL-6_16_26-8_00-AM-PT.pdf',
    snippet: 'MLCommons record of CoreWeave DeepSeek-V3 target-quality training times: 5.54 minutes on 2,048 GB300 GPUs, 3.09 minutes on 4,096, and 2.02 minutes on 8,192.'
  },
  {
    key: 'q1-2026-release',
    provider: 'coreweave-investor-relations',
    type: 'filed_company_release',
    title: 'CoreWeave Q1 2026 results release',
    url: 'https://investors.coreweave.com/news/news-details/2026/CoreWeave-Reports-Strong-First-Quarter-2026-Results/',
    snippet: 'Filed Q1 2026 results release reporting revenue backlog, active and contracted power, financing changes, customer announcements, and product launches.'
  }
]);

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const pct = value => `${(value * 100).toFixed(1)}%`;
const money = value => `$${value.toFixed(value >= 10 ? 1 : 2)} billion`;
const sourceKey = source => {
  const explicit = clean(source?.metadata?.evidenceKey).toLowerCase();
  if (explicit) return explicit;
  const form = clean(source?.metadata?.form).toUpperCase();
  if (form === '10-Q') return 'q1-2026-10q';
  if (form === '10-K') return 'fy2025-10k';
  return clean(source?.citationLabel).toLowerCase();
};

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
        'crwv-judgment-control-point',
        'partial',
        ['q1-2026-10q', 'coreweave-security-architecture', 'coreweave-cks', 'mlperf-training-v6'],
        `CoreWeave is best understood as a time-to-capacity and cluster-operations business, not as a proprietary accelerator company. Its control point is the ability to assemble scarce NVIDIA systems, power, network fabric, storage, bare-metal Kubernetes, observability, and financing into usable capacity faster than a customer can do so internally. The architecture is technically real, and the MLPerf record shows that CoreWeave can operate 8,192-GPU training systems to a fixed quality target. But most primitives—NVIDIA GPUs and DPUs, InfiniBand, Kubernetes, Cilium, VAST-class storage, and standard telemetry—are available to competitors. The moat therefore lives in execution, fleet operations, capacity access, and contract design; it must be proven through useful-work economics, reliability, and deployment speed rather than asserted from the component list.`
      ),
      claim(
        'crwv-judgment-capital-loop',
        'partial',
        ['q1-2026-10q', 'fy2025-10k'],
        `The investment is a leveraged conversion loop: long-dated customer commitments support debt and lease financing; financing buys rapidly depreciating compute and data-center capacity; delivered capacity produces revenue; and the residual cash after operating cost, interest, reinvestment, and refinancing belongs to equity. Q1 2026 shows the loop scaling but not yet self-funding. Revenue doubled, yet operating loss widened, cash capex reached $7.695 billion, and debt principal reached $25.149 billion. The decisive question is not whether AI demand is large. It is whether contract cash arrives before the capital stack and technology refresh cycle consume the economics.`
      ),
      claim(
        'crwv-judgment-security',
        'partial',
        ['price-snapshot', 'q1-2026-10q', 'fy2025-10k'],
        `At the July 24 price snapshot, CoreWeave is neither an obvious bargain nor analyzable through a conventional trailing free-cash-flow multiple because current free cash flow is deeply negative and working-capital timing dominates operating cash flow. The security can work if the company turns RPO into high-utilization capacity, lowers its marginal financing cost, and reuses infrastructure across successive GPU generations without chronic dilution. It can fail despite revenue growth if contracts require continued NVIDIA refreshes, customer concentration reduces pricing power, or capacity and financing obligations mature faster than the cash they produce.`
      )
    ]
  },
  {
    heading: 'Implied Expectations',
    claims: [
      claim(
        'crwv-expectations-snapshot',
        'supported',
        ['price-snapshot', 'q1-2026-10q'],
        `The dated market boundary is $81.10 per Class A share on July 24, 2026. Multiplying that price by the 447,573,939 Class A and 97,996,407 Class B shares reported outstanding as of April 30 produces approximately ${money(derived.equityValue)} of basic equity value. Subtracting $2.266 billion of cash and marketable securities from $24.859 billion of reported debt gives approximately ${money(derived.netDebt)} of net debt and an equity-plus-net-debt enterprise boundary near ${money(derived.equityValue + derived.netDebt)}. This omits options, RSUs, warrants, later issuance, operating leases, minority structures, and acquisition adjustments; it is a reproducible boundary, not a fully diluted valuation.`
      ),
      claim(
        'crwv-expectations-reverse',
        'partial',
        ['price-snapshot', 'q1-2026-10q', 'fy2025-10k'],
        `For the basic equity value to compound at the owner's 10% annual hurdle for five years, it must reach roughly ${money(derived.targetEquityValue)} before dividends. Holding current net debt flat solely as a sensitivity implies a year-five enterprise value near ${money(derived.terminalEnterpriseValue)}. At terminal enterprise-value-to-revenue multiples of 4x, 6x, and 8x, CoreWeave would need about ${money(derived.requiredRevenue4x)}, ${money(derived.requiredRevenue6x)}, or ${money(derived.requiredRevenue8x)} of year-five revenue—approximately ${pct(derived.requiredRevenueCagr4x)}, ${pct(derived.requiredRevenueCagr6x)}, or ${pct(derived.requiredRevenueCagr8x)} annual growth from FY2025. These are identities, not forecasts. The flat-net-debt assumption is especially demanding because the current buildout is financed externally; if net debt rises, required revenue or terminal valuation rises with it.`
      ),
      claim(
        'crwv-expectations-rpo-boundary',
        'partial',
        ['q1-2026-10q'],
        `The $98.8 billion RPO balance is not comparable to market capitalization or enterprise value. RPO is gross contracted revenue before power, rent, depreciation, operating expense, interest, taxes, new capacity, service credits, resale rights, and variable consideration. The disclosed recognition schedule places about ${money(derived.rpoFirst24Months)} in the first 24 months, ${money(derived.rpoMonths25To48)} in months 25–48, and ${money(derived.rpoMonths49To84)} in months 49–84. Equity value depends on the margin and capital required to deliver that schedule, not on the headline backlog. A useful quarterly bridge is opening RPO plus new bookings minus recognized revenue minus credits, delays, and resale adjustments; the company does not yet disclose enough detail to calculate contract-level value.`
      )
    ]
  },
  {
    heading: 'Thesis-Changing Questions',
    claims: [
      claim(
        'crwv-question-contract-cash',
        'partial',
        ['q1-2026-10q'],
        `Does each incremental dollar of contracted revenue produce cash before the associated debt and lease obligations mature? The test is not GAAP revenue growth alone. Track cash collected from customers, deferred revenue, customer liabilities, working-capital movements, cash interest, cash capex, and principal repayments against the RPO cohort being delivered. If the company repeatedly needs new debt or equity after customer prepayments and operating cash flow, the contract book is financing growth but not yet compounding common equity.`
      ),
      claim(
        'crwv-question-scarcity-duration',
        'partial',
        ['q1-2026-10q', 'coreweave-pricing', 'coreweave-capacity-plans'],
        `How long does scarcity persist at each accelerator generation? CoreWeave can earn attractive economics when it secures new NVIDIA systems and powered sites before competitors, then sells multi-year capacity while supply is tight. The advantage decays as hyperscalers, neoclouds, and customers obtain the same hardware or as custom accelerators absorb stable workloads. The observable test is realized price and utilization by GPU generation, not fleet size: a rising spot discount, shorter reservation duration, or faster migration away from older GPUs would reveal declining scarcity rents before aggregate revenue slows.`
      ),
      claim(
        'crwv-question-financing-curve',
        'partial',
        ['q1-2026-10q', 'q1-2026-release'],
        `Is CoreWeave moving down the financing-cost curve quickly enough to offset the increasing capital base? Older facilities carry effective rates from roughly 9% to 15%, while the new non-recourse DDTL 4.0 includes floating commitments at SOFR plus 2.25% and fixed commitments described near 5.9% at announcement. That is potentially important: asset- and contract-backed financing can lower marginal cost and isolate project risk. It is not automatically value creation, because collateral packages, amortization triggers, restricted cash, customer-contract assignments, and refinancing needs can transfer upside or flexibility away from common equity.`
      ),
      claim(
        'crwv-question-counterparty',
        'supported',
        ['q1-2026-10q', 'fy2025-10k'],
        `Who ultimately bears demand and technology risk? Three customers represented 39%, 17%, and 22% of accounts receivable at March 31, 2026, while current customers contractually specify NVIDIA GPUs. CoreWeave therefore sits between concentrated buyers and a concentrated supplier base. If customer commitments are genuinely take-or-pay through a technology transition, risk shifts toward customers; if service credits, delivery conditions, renegotiation rights, or specified-hardware refreshes remain material, CoreWeave retains more risk than the RPO headline suggests.`
      )
    ]
  },
  {
    heading: 'Product and Technical Moat',
    claims: [
      claim(
        'crwv-moat-architecture',
        'supported',
        ['coreweave-security-architecture', 'coreweave-cks', 'coreweave-b200'],
        `CoreWeave's production architecture is more specific than “GPU cloud.” CKS runs Kubernetes on bare metal rather than behind a general-purpose hypervisor. A Clos leaf-spine network uses BGP unnumbered EVPN and VXLAN for tenant segmentation; BlueField-3 DPUs offload routing, firewalling, bootstrapping, and CNI functions; Cilium or equivalent eBPF networking manages east-west policy; and the B200 system pairs NVLink inside the node with eight ConnectX-7 adapters and 400G NDR InfiniBand across nodes. This design can reduce jitter, preserve host CPU capacity, and expose more of the system to customer observability.`
      ),
      claim(
        'crwv-moat-integration-boundary',
        'partial',
        ['coreweave-security-architecture', 'coreweave-cks', 'coreweave-b200'],
        `The same evidence narrows the moat. CoreWeave's differentiated asset is the tested integration and operating discipline around largely third-party and open components, not ownership of the accelerator, interconnect standard, orchestration framework, or storage primitive. A customer does not need to recreate every component; it needs an alternative provider whose cluster goodput, failure recovery, deployment lead time, and support burden are good enough at a lower fully loaded price. The switching cost is therefore workload- and contract-specific. It should be measured in porting and qualification time, lost productive GPU-hours, data movement, and reliability risk—not inferred from Kubernetes familiarity or customer logos.`
      ),
      claim(
        'crwv-moat-mlperf-time-cost',
        'partial',
        ['mlperf-training-v6'],
        `MLPerf Training v6.0 provides a rare external system test. CoreWeave reached the DeepSeek-V3 quality target in 5.54 minutes on 2,048 GB300 GPUs, 3.09 minutes on 4,096, and 2.02 minutes on 8,192. Moving from 2,048 to 8,192 GPUs reduced elapsed time by ${pct(derived.mlperfTimeReduction)}, but GPU-minutes rose from ${Math.round(derived.mlperfGpuMinutes2048).toLocaleString()} to ${Math.round(derived.mlperfGpuMinutes8192).toLocaleString()}, an increase of ${pct(derived.mlperfGpuMinuteIncrease)}; simple strong-scaling efficiency across the fourfold scale-up was about ${pct(derived.mlperfStrongScalingEfficiency)}. The result proves exceptional scale and a valuable time-to-solution frontier. It does not prove that the fastest configuration is the cheapest: a customer rationally pays for the extra GPU-minutes only when earlier model completion is worth more than the incremental compute.`
      ),
      claim(
        'crwv-moat-evidence-needed',
        'partial',
        ['mlperf-training-v6', 'coreweave-pricing', 'coreweave-capacity-plans'],
        `The missing moat evidence is economic, not architectural. For a fixed model, quality target, and service level, compare accepted output per paid calendar GPU-hour, measured wall energy, failure and replay losses, queue time, engineering hours through qualification, data-transfer cost, and deployment lead time. Public benchmarks disclose target-quality time but not negotiated price, production utilization, customer labor, or interruption economics. Until those inputs exist, “purpose-built” and “higher utilization” remain mechanisms to test rather than proven customer surplus.`
      )
    ]
  },
  {
    heading: 'System and Unit Economics',
    claims: [
      claim(
        'crwv-unit-ocf-quality',
        'supported',
        ['q1-2026-10q'],
        `Q1 operating cash flow of $2.984 billion overstates recurring cash economics if read without the bridge. Approximately $2.016 billion—${pct(derived.workingCapitalShareOfOcf)} of reported operating cash flow—came from the net effect of accounts receivable, prepaid assets, accounts payable and accrued expenses, deferred revenue, and lease liabilities. Depreciation and amortization added back another $1.147 billion against a $740 million net loss. The quarter generated cash because customers and suppliers financed the operating cycle and depreciation is non-cash; it did not establish mature cash earnings.`
      ),
      claim(
        'crwv-unit-fcf',
        'supported',
        ['q1-2026-10q'],
        `Cash purchases of property and equipment were $7.695 billion in Q1, or ${derived.capexToRevenue.toFixed(1)} times quarterly revenue. Subtracting that cash capex from operating cash flow produces approximately negative $${Math.abs(derived.q1FreeCashFlow / 1e3).toFixed(3)} billion of free cash flow before acquisitions—a non-GAAP calculation, not a company metric. Financing supplied $3.914 billion and cash plus restricted cash fell by $810 million. The key unit is therefore not current free-cash-flow margin; it is lifetime cash contribution per delivered capacity cohort after hardware, power, rent, interest, refresh capex, and residual value.`
      ),
      claim(
        'crwv-unit-price-curve',
        'supported',
        ['coreweave-pricing', 'coreweave-capacity-plans'],
        `CoreWeave's public North America price card makes the utilization problem visible. An eight-GPU H100 instance lists at $49.24 per hour on demand, or about $${derived.h100OnDemandPerGpuHour.toFixed(2)} per GPU-hour, versus $19.71 per hour on spot, or about $${derived.h100SpotPerGpuHour.toFixed(2)} per GPU-hour—a ${pct(derived.h100SpotDiscount)} discount for interruptible capacity. H200 lists near $${derived.h200OnDemandPerGpuHour.toFixed(2)} per GPU-hour and B200 near $${derived.b200OnDemandPerGpuHour.toFixed(2)}. These are list prices, not realized contract economics, but they show that reservation certainty and interruption risk can matter as much as the chip generation. Flex adds a holding charge plus an active-usage charge, explicitly monetizing availability separately from consumption.`
      ),
      claim(
        'crwv-unit-formula',
        'partial',
        ['q1-2026-10q', 'coreweave-pricing', 'coreweave-capacity-plans', 'mlperf-training-v6'],
        `Underwrite each capacity cohort with Caccepted = (cash hardware and facility cost + power + rent + operations + cash interest + refresh and failure cost − customer prepayments − residual value) divided by accepted workload output. Accepted output must satisfy the customer's quality and service level; nominal GPU-hours and peak FLOPS are not enough. Revenue per GPU-hour is also insufficient because CoreWeave can improve reported utilization while destroying value through lower prices, high power cost, excess refresh capex, or expensive financing. The public filings do not yet provide cohort-level numerator or denominator data, which is itself the central diligence gap.`
      )
    ]
  },
  {
    heading: 'Operating Engine and Capital Allocation',
    claims: [
      claim(
        'crwv-engine-flywheel',
        'partial',
        ['q1-2026-10q', 'q1-2026-release'],
        `The favorable flywheel is customer commitments → cheaper project financing → earlier equipment orders and powered capacity → faster deployment → stronger customer trust → larger commitments. Q1 evidence supports several links: RPO rose to $98.8 billion, active power exceeded 1 GW, contracted power exceeded 3.5 GW, and the company opened an $8.5 billion delayed-draw facility. The weak link is equity cash conversion. The flywheel compounds owner value only if each new cohort lowers financing cost, reaches utilization quickly, and throws off cash after refresh needs; otherwise growth merely supports a larger secured-credit machine.`
      ),
      claim(
        'crwv-engine-debt-load',
        'supported',
        ['q1-2026-10q'],
        `Debt principal reached $25.149 billion at March 31, including $7.547 billion classified current. Scheduled principal payments were $6.066 billion for the rest of 2026 and $5.652 billion in 2027 before later maturities. Q1 net interest expense was $536 million, equal to ${pct(derived.interestToGrossProfit)} of the simple revenue-minus-cost-of-revenue gross-profit proxy. That burden is not captured by gross margin, and capitalized interest of $97 million means some financing cost also entered the asset base rather than current expense.`
      ),
      claim(
        'crwv-engine-marginal-capital',
        'partial',
        ['q1-2026-10q', 'q1-2026-release'],
        `Marginal capital appears to be improving but remains structurally important. DDTL 4.0 is non-recourse at the borrowing subsidiary and priced below several legacy facilities; NVIDIA also invested $2 billion of equity at $87.20 per share in January 2026. Lower-cost financing can expand equity value if it reflects better contract quality and ring-fences project risk. It can also mask circular demand: NVIDIA is simultaneously CoreWeave's strategic shareholder and the mandatory GPU supplier specified in customer contracts. Treat NVIDIA's investment as financing and strategic alignment, not independent proof of end-customer economics.`
      )
    ]
  },
  {
    heading: 'Obligations, Concentration, and Policy',
    claims: [
      claim(
        'crwv-obligations-stack',
        'supported',
        ['q1-2026-10q'],
        `At March 31, debt net of discounts was $24.859 billion, operating lease liabilities were $10.050 billion, and cash plus marketable securities were $2.266 billion. Net debt plus recognized operating lease liabilities therefore approximated ${money(derived.debtAndLeaseClaimsNetOfCash)} before finance leases, financing obligations, uncommenced leases, purchase commitments, joint ventures, taxes, and other claims. The filing separately disclosed $40.7 billion of future undiscounted payments for leases not yet commenced and a large 525 MW site contract. Those figures must not simply be added to enterprise value because timing, discounting, overlap, and project-specific recourse differ; they do show how much future execution is already encumbered.`
      ),
      claim(
        'crwv-obligations-two-sided',
        'supported',
        ['q1-2026-10q', 'fy2025-10k'],
        `The business is concentrated on both sides. Three customers represented 78% of March accounts receivable, while three suppliers represented 60% of FY2025 purchases. All GPUs currently deployed are NVIDIA because customer contracts specify them, yet CoreWeave says it has no long-term supplier contracts guaranteeing capacity or payment terms after individual purchase orders. This is unusual: long-dated customer promises can be tied to a component whose future price, lead time, and generation cadence CoreWeave does not control.`
      ),
      claim(
        'crwv-obligations-obsolescence',
        'partial',
        ['q1-2026-10q', 'coreweave-pricing'],
        `Technology obsolescence is a capital-allocation risk, not merely a product risk. CoreWeave must estimate infrastructure useful lives and redeploy components beyond their initial contracted life, while its own price card spans A100, H100, H200, B200, and newer systems at sharply different rates. A fleet can remain technically usable but economically impaired if customers migrate to newer accelerators faster than depreciation schedules or debt amortization assume. The quarterly test is realized revenue and utilization by generation, impairment or useful-life changes, residual sales, and whether older equipment can serve inference or enterprise workloads without destructive repricing.`
      )
    ]
  },
  {
    heading: 'What Would Change the Thesis',
    claims: [
      claim(
        'crwv-falsifiers-financial',
        'partial',
        ['q1-2026-10q'],
        `The thesis strengthens when operating cash flow excluding working-capital changes is consistently positive, cash capex falls below 1.5 times revenue while growth remains strong, interest expense falls below 25% of gross profit, and new project financing prices below the legacy debt curve without increasing parent guarantees or dilution. It weakens if the company repeatedly issues equity to cover cohort cash deficits, current maturities rise faster than unrestricted liquidity, or new capacity requires progressively more debt per dollar of RPO converted. These thresholds are analyst tests, not management guidance.`
      ),
      claim(
        'crwv-falsifiers-product',
        'partial',
        ['mlperf-training-v6', 'coreweave-pricing', 'coreweave-capacity-plans'],
        `The product thesis strengthens if CoreWeave publishes matched goodput, failure, and wall-power evidence showing lower cost per accepted unit than comparable clouds at a similar service level, while maintaining a premium or narrowing spot discounts. It weakens if benchmark time-to-solution requires progressively more excess GPU-minutes, spot discounts widen across current-generation systems, or customers can move large production workloads to hyperscalers, neoclouds, or custom accelerators without material porting and qualification cost.`
      ),
      claim(
        'crwv-falsifiers-contract',
        'partial',
        ['q1-2026-10q'],
        `The contract thesis strengthens when top-customer concentration declines, recognized revenue and cash collection track the disclosed RPO schedule, and service credits or resale adjustments remain immaterial. It weakens if RPO growth is driven by longer duration rather than near-term conversion, if named customers renegotiate capacity or hardware specifications, or if deferred revenue and customer financing decline while capex commitments continue rising.`
      )
    ]
  },
  {
    heading: 'Next Evidence and Maintenance Test',
    claims: [
      claim(
        'crwv-next-filing-test',
        'partial',
        ['q1-2026-10q', 'fy2025-10k'],
        `At the next 10-Q, rebuild a cohort cash bridge: opening RPO; new commitments; revenue recognized; credits, delays, and resale adjustments; customer cash collected; operating cash flow before working-capital changes; cash capex; new debt and equity; principal repaid; cash interest; and ending unrestricted cash. Recalculate the dated equity boundary with the new share count and price, but do not advance the SEC evidence clock from a quote alone.`
      ),
      claim(
        'crwv-next-product-test',
        'partial',
        ['mlperf-training-v6', 'coreweave-pricing', 'coreweave-capacity-plans'],
        `At the next public benchmark or price-card change, record target-quality time, GPU count, GPU-minutes, system power if available, on-demand and spot rates, and the reservation terms for the same generation. The maintenance event should say whether time-to-solution improved, whether compute consumed per accepted run improved or deteriorated, and whether the price curve suggests stronger or weaker scarcity. A faster benchmark alone is not a moat update.`
      )
    ]
  }
]);

const findSectionIndex = (content, heading) => content.findIndex(node => (
  node?.type === 'heading'
  && clean((node.content || []).map(child => child.text || '').join('')) === heading
));

const nodeText = node => clean((node?.content || []).map(child => child.text || '').join(''));
const headingNode = heading => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text: heading }]
});
const paragraphNode = ({ text, claimId = '', support = '', citationIndexes = [] }) => ({
  type: 'paragraph',
  content: text ? [{
    type: 'text',
    text,
    ...(claimId ? {
      marks: [{
        type: 'claim',
        attrs: {
          claimId,
          support,
          citationIndexes,
          contradictionIndexes: []
        }
      }]
    } : {})
  }] : []
});

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
        quote: '',
        url: source.url,
        confidence: 0.9,
        createdAt: now
      };
      candidate.citations.push(citation);
    }
    map.set(key, { source, citation, index: index + 1 });
  });
  let added = 0;
  SOURCES.forEach(row => {
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
        evidenceType: row.type,
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
      quote: '',
      url: source.url,
      confidence: row.key === 'price-snapshot' ? 0.85 : 0.94,
      createdAt: now
    };
    candidate.sourceRefs.push(source);
    candidate.citations.push(citation);
    map.set(row.key, { source, citation, index: candidate.sourceRefs.length });
    added += 1;
  });
  return { map, added };
};

const applyResearch = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  candidate.body = candidate.body || { type: 'doc', content: [] };
  candidate.body.content = Array.isArray(candidate.body.content) ? candidate.body.content : [];
  const { map, added } = ensureSources({ candidate, now });
  const sections = buildSections();
  const claims = [];
  const body = [];

  const lead = claim(
    'crwv-investor-brief',
    'partial',
    ['q1-2026-10q', 'fy2025-10k', 'price-snapshot', 'mlperf-training-v6'],
    `CoreWeave is a leveraged time-to-capacity business. The technical system can turn thousands of scarce NVIDIA accelerators into usable model-training capacity faster than many customers can build internally, but the equity only compounds if those contracts repay the hardware, power, leases, debt, refresh cycle, and dilution before scarcity rents disappear. At $81.10, the market asks investors to underwrite both exceptional demand and a still-unproven cash-conversion engine. The decisive evidence is not RPO or GPU count in isolation; it is contract cash converted into accepted workload output per dollar of senior capital.`
  );
  const allClaims = [lead, ...sections.flatMap(section => section.claims)];

  allClaims.forEach(row => {
    const evidence = row.sources.map(key => map.get(key));
    if (evidence.some(item => !item?.source || !item?.citation)) {
      throw new Error(`Missing source evidence for ${row.id}: ${row.sources.join(', ')}`);
    }
    claims.push({
      claimId: row.id,
      text: row.text,
      section: row === lead ? 'Investor brief' : sections.find(section => section.claims.includes(row))?.heading || '',
      support: row.support,
      citationIds: evidence.map(item => item.citation._id),
      sourceRefIds: evidence.map(item => item.source._id),
      contradictedByCitationIds: [],
      confidence: row.support === 'supported' ? 0.92 : 0.74,
      lastReviewedAt: now,
      lastVerifiedAt: now,
      history: [{
        at: now,
        event: 'created',
        support: row.support,
        text: row.text,
        section: row === lead ? 'Investor brief' : sections.find(section => section.claims.includes(row))?.heading || '',
        citationIds: evidence.map(item => item.citation._id),
        sourceRefIds: evidence.map(item => item.source._id),
        contradictedByCitationIds: [],
        summary: 'Added through the CoreWeave decision-dossier research pass.'
      }],
      createdAt: now
    });
  });

  const leadEvidence = lead.sources.map(key => map.get(key));
  body.push(paragraphNode({
    text: lead.text,
    claimId: lead.id,
    support: lead.support,
    citationIndexes: leadEvidence.map(item => item.index)
  }));
  sections.forEach(section => {
    body.push(headingNode(section.heading));
    section.claims.forEach(row => {
      const evidence = row.sources.map(key => map.get(key));
      body.push(paragraphNode({
        text: row.text,
        claimId: row.id,
        support: row.support,
        citationIndexes: evidence.map(item => item.index)
      }));
    });
  });
  body.push(headingNode('Notes'));
  body.push(paragraphNode({ text: 'The owner’s working hurdle is a 10% annual return over five years.' }));
  body.push(paragraphNode({ text: 'This is a business-quality judgment and a security-attractiveness judgment; the two must not be collapsed into one.' }));

  candidate.body = { type: 'doc', content: body };
  candidate.plainText = body.map(node => nodeText(node)).filter(Boolean).join('\n\n');
  candidate.claims = claims;
  candidate.sourceScope = 'selected_sources';
  candidate.freshness = {
    ...(candidate.freshness || {}),
    status: 'fresh',
    lastMaintainedAt: now,
    lastDirectUpdateAt: now
  };
  candidate.aiState = {
    ...(candidate.aiState || {}),
    lastDraftedAt: now,
    maintenanceSummary: 'Rebuilt CoreWeave around contract-to-cash conversion, time-to-solution economics, capital structure, and observable moat tests using free filing, technical, pricing, and benchmark evidence.',
    changeLog: [{
      type: 'research_revision',
      title: 'CoreWeave decision dossier',
      text: 'Replaced the broad filing summary with a reverse-expectations model, cash-conversion bridge, MLPerf time-versus-GPU-minute analysis, architecture boundary, financing curve, and explicit falsifiers.',
      sourceRefIds: SOURCES.map(row => id(map.get(row.key)?.source?._id)).filter(Boolean),
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, addedSourceCount: added, addedClaimCount: claims.length };
};

const strictValidate = candidate => {
  const failures = [];
  const words = clean(candidate.plainText).split(/\s+/).filter(Boolean).length;
  const headings = (candidate.body?.content || []).filter(node => node.type === 'heading').map(nodeText);
  const requiredHeadings = buildSections().map(section => section.heading);
  const unsupported = (candidate.claims || []).filter(row => row.support === 'unsupported');
  const uncited = (candidate.claims || []).filter(row => !(row.sourceRefIds || []).length || !(row.citationIds || []).length);
  // Reward analytical density rather than padding. The gate is claim/source
  // coverage plus required decision modules; 2,500 words is enough when each
  // paragraph carries a cited calculation, mechanism, or falsifier.
  if (words < 2_500) failures.push(`Too short for a decision dossier: ${words} words.`);
  if (words > 6_000) failures.push(`Too long for the decision-dossier contract: ${words} words.`);
  requiredHeadings.forEach(heading => {
    if (!headings.includes(heading)) failures.push(`Missing required heading: ${heading}.`);
  });
  if ((candidate.claims || []).length < 28) failures.push(`Too few claim-level analytical units: ${(candidate.claims || []).length}.`);
  if ((candidate.sourceRefs || []).length < 9) failures.push(`Too few evidence sources: ${(candidate.sourceRefs || []).length}.`);
  if (unsupported.length) failures.push(`${unsupported.length} claims remain unsupported.`);
  if (uncited.length) failures.push(`${uncited.length} claims lack citations.`);
  [
    'GPU-minutes',
    'working-capital',
    'negative $4.711 billion',
    'simple strong-scaling efficiency',
    'enterprise-value-to-revenue',
    'customer commitments → cheaper project financing',
    'time-to-capacity',
    'contract cash converted into accepted workload output'
  ].forEach(required => {
    if (!candidate.plainText.includes(required)) failures.push(`Missing analytical module: ${required}.`);
  });
  if (candidate.plainText.includes('still needs source-backed development')) failures.push('Contains a development placeholder.');
  if (candidate.plainText.includes('[[')) failures.push('Contains raw wiki-link syntax.');
  return {
    ok: failures.length === 0,
    failures,
    metrics: {
      words,
      headings: headings.length,
      claims: (candidate.claims || []).length,
      sources: (candidate.sourceRefs || []).length,
      unsupported: unsupported.length,
      uncited: uncited.length
    }
  };
};

const summarize = page => ({
  id: id(page),
  title: page.title,
  words: clean(page.plainText).split(/\s+/).filter(Boolean).length,
  sources: page.sourceRefs?.length || 0,
  claims: page.claims?.length || 0,
  quality: page.aiState?.quality || null
});

const writeJson = (name, payload) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return target;
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const page = await WikiPage.findById(PAGE_ID);
  if (!page || page.externalWatches?.edgar?.ticker !== 'CRWV') {
    throw new Error('Target must be the authenticated CRWV company dossier.');
  }
  const before = snapshotPage(page);
  const result = applyResearch({ page: page.toObject({ virtuals: false }) });
  const strict = strictValidate(result.candidate);
  const quality = evaluateWikiArticleQuality({
    page: result.candidate,
    body: result.candidate.body,
    claims: result.candidate.claims,
    sourceRefs: result.candidate.sourceRefs,
    now: new Date()
  });
  result.candidate.aiState = {
    ...(result.candidate.aiState || {}),
    quality
  };
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run',
    before: summarize(page),
    after: summarize(result.candidate),
    addedSourceCount: result.addedSourceCount,
    addedClaimCount: result.addedClaimCount,
    strict,
    quality,
    derived
  };
  if (!strict.ok || !quality.ok) {
    throw new Error(`CoreWeave decision dossier failed: ${JSON.stringify({ strict, quality })}`);
  }
  if (!APPLY) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const beforePath = writeJson(`before-${stamp}.json`, { capturedAt: new Date().toISOString(), page: before, preview });
  const event = new WikiSourceEvent({
    userId: page.userId,
    sourceType: 'external',
    provider: 'coreweave-decision-dossier-review',
    externalId: `coreweave-decision-dossier:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated',
    title: 'CoreWeave decision-dossier research review',
    summary: 'Free filings, technical documentation, pricing, capacity-plan documentation, and MLPerf evidence were reviewed to replace the broad company summary with decision-grade investment analysis.',
    text: 'The review added a dated reverse-expectations boundary, working-capital and free-cash-flow bridge, contract-to-capital conversion model, MLPerf time-versus-GPU-minute analysis, technical architecture boundary, financing-cost curve, and observable falsifiers.',
    url: SOURCES.find(row => row.key === 'mlperf-training-v6').url,
    sourceUpdatedAt: RESEARCH_AS_OF,
    status: 'processed',
    affectedPageIds: [page._id],
    processedAt: new Date(),
    metadata: {
      source: 'coreweave-decision-dossier-review',
      sourceUrls: SOURCES.map(row => row.url),
      researchRevision: true,
      maintenanceClockEligible: false,
      asOf: RESEARCH_AS_OF
    }
  });
  await event.save();
  for (const [key, value] of Object.entries(result.candidate)) {
    if (['_id', 'id', 'userId', 'createdAt', 'updatedAt', '__v'].includes(key)) continue;
    page[key] = clone(value);
    page.markModified(key);
  }
  page.aiState.quality = quality;
  page.markModified('aiState');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision,
    userId: page.userId,
    page,
    before,
    after: snapshotPage(page),
    reason: 'agent_maintenance',
    actorType: 'agent',
    sourceEventId: event._id,
    promotionStatus: 'promoted',
    sourceVersion: {
      provider: 'coreweave-decision-dossier-review',
      asOf: RESEARCH_AS_OF,
      sourceCount: SOURCES.length,
      researchRevision: true,
      maintenanceClockEligible: false
    },
    quality: {
      ...quality,
      comparison: {
        claimDeltas: {
          added: result.addedClaimCount,
          changed: 1,
          gainedSupport: 0,
          contradicted: 0,
          preserved: 0,
          removed: before.claims?.length || 0
        }
      }
    },
    summary: 'Rebuilt CoreWeave into a decision dossier centered on time-to-capacity, contract cash conversion, useful-work economics, capital obligations, reverse expectations, and explicit falsifiers.'
  });
  const afterPath = writeJson(`after-${stamp}.json`, {
    capturedAt: new Date().toISOString(),
    page: snapshotPage(page),
    eventId: id(event),
    revisionId: id(revision),
    preview
  });
  console.log(JSON.stringify({
    ...preview,
    eventId: id(event),
    revisionId: id(revision),
    beforePath,
    afterPath
  }, null, 2));
};

if (require.main === module) {
  main()
    .then(() => mongoose.disconnect())
    .catch(async error => {
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
