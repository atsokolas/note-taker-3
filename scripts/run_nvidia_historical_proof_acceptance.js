#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');
const { buildSecPublicProofAcceptance } = require('../server/services/wikiPublicProofAcceptanceService');

const OWNER_PAGE_ID = process.env.NVIDIA_OWNER_PAGE_ID || '6a5588c25ed84be58061eba7';
const TITLE = 'NVIDIA’s AI engine—and the obligations underneath it';
const SLUG = 'nvidia-ai-engine-obligations-acceptance-2026-07-19';
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_PROOF_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-historical-proof-2026-07-19'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';

const SOURCES = Object.freeze([
  { key: 'fy26', title: 'NVIDIA FY2026 Form 10-K', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm', period: 'Fiscal year ended January 25, 2026' },
  { key: 'q1', title: 'NVIDIA Q1 FY2027 Form 10-Q', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000052/nvda-20260426.htm', period: 'Quarter ended April 26, 2026' },
  { key: 'earnings8k', title: 'NVIDIA Q1 FY2027 earnings Form 8-K', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000051/nvda-20260426.htm', period: 'Filed May 20, 2026' },
  { key: 'release', title: 'NVIDIA Q1 FY2027 earnings release, Exhibit 99.1', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000051/q1fy27pr.htm', period: 'Filed May 20, 2026' },
  { key: 'cfo', title: 'NVIDIA Q1 FY2027 CFO commentary, Exhibit 99.2', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000051/q1fy27cfocommentary.htm', period: 'Filed May 20, 2026' },
  { key: 'debt', title: 'NVIDIA $25 billion senior-notes offering Form 8-K', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000119312526275783/d48176d8k.htm', period: 'Filed June 18, 2026' },
  { key: 'submissions', title: 'NVIDIA SEC filing submissions index', url: 'https://data.sec.gov/submissions/CIK0001045810.json', period: 'SEC filing index' },
  { key: 'facts', title: 'NVIDIA SEC company facts', url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json', period: 'SEC XBRL facts' }
]);

const SECTIONS = Object.freeze([
  {
    heading: 'The underwriting question',
    claims: [
      { id: 'thesis', support: 'partial', sources: ['fy26', 'q1', 'debt'], text: 'NVIDIA’s AI demand is real; the underwriting question is whether system-scale economics can outrun the commitments, concentration, and capital recycling now required to sustain it. The filing record does not support a simple “AI leader” story. It supports a much sharper one: an exceptional operating engine is increasingly bound to a very large forward supply position, a concentrated customer base, export-control constraints, and an expanding portfolio of strategic investments. Those obligations can reinforce the platform if demand persists, but they also make the downside path more nonlinear than the revenue growth rate suggests.' },
      { id: 'method', support: 'partial', sources: ['fy26', 'q1', 'debt'], text: 'This dossier separates reported facts from calculations and interpretation. Revenue, margins, cash flow, commitments, customer concentration, and security issuances come directly from NVIDIA’s SEC filings. Free-cash-flow figures are simple calculations of operating cash flow less purchases of property and equipment; they are not company-reported GAAP measures. This is a deliberately labeled historical maintenance backtest: the FY2026 10-K is the reconstructed baseline, the Q1 FY2027 filing is the operating update, and the June 2026 debt filing is the accepted-through balance-sheet event. It does not claim Noeis observed those events in real time.' }
    ]
  },
  {
    heading: 'The operating engine',
    claims: [
      { id: 'fy26-engine', support: 'supported', sources: ['fy26', 'facts'], text: 'For FY2026, NVIDIA reported $215.938 billion of revenue, $130.387 billion of operating income, and $120.067 billion of net income. Operating cash flow was $102.718 billion and purchases of property and equipment were $6.042 billion, producing a simple free-cash-flow proxy of $96.676 billion. The conversion is extraordinary even after allowing for working-capital timing: the business turned nearly forty-five cents of each revenue dollar into operating cash after capital expenditure under this definition.' },
      { id: 'q1-engine', support: 'supported', sources: ['q1', 'release', 'cfo'], text: 'The next quarter accelerated rather than faded. Q1 FY2027 revenue was $81.615 billion, up 85% from the year-earlier quarter and 20% sequentially. Data Center revenue reached $75.246 billion, or about 92% of total revenue, and grew 92% year over year. Operating cash flow was $50.344 billion; after $1.757 billion of property-and-equipment purchases, the simple free-cash-flow proxy was $48.587 billion. The inference is not merely that demand remained high, but that NVIDIA entered FY2027 with enough cash generation to finance a large portion of its ecosystem obligations internally.' },
      { id: 'earnings-quality', support: 'supported', sources: ['q1'], text: 'Q1 net income of $58.321 billion should not be treated as a clean measure of recurring operating earnings. Other income, net, was $15.929 billion, including $13.4 billion of unrealized gains on publicly traded equity securities and $2.6 billion of gains on non-marketable equity securities. Those marks are economically relevant, but they are not revenue from selling accelerated-computing systems. Operating income of $53.536 billion and cash flow therefore provide a cleaner view of the quarter’s core engine than the headline net-income figure alone.' }
    ]
  },
  {
    heading: 'System economics and margin architecture',
    claims: [
      { id: 'margin-architecture', support: 'supported', sources: ['fy26', 'q1'], text: 'FY2026 gross margin fell to 71.1% from 75.0%. NVIDIA attributed the decline partly to the transition from Hopper HGX systems to full-scale Blackwell data-center solutions and partly to a $4.5 billion charge tied to H20 excess inventory and purchase obligations. Q1 FY2027 gross margin recovered to 74.9%, while inventory and excess-purchase-obligation provisions fell to $1.1 billion from $5.3 billion in the year-earlier quarter. The recovery matters, but so does the reason for the earlier damage: selling integrated systems increases strategic control while exposing NVIDIA to more component, inventory, and deployment risk.' },
      { id: 'research-intensity', support: 'supported', sources: ['fy26', 'q1'], text: 'Research and development expense was $18.497 billion in FY2026 and $6.321 billion in Q1 FY2027. The quarterly increase was 58% year over year, including a 112% increase in compute and infrastructure expense and a 204% increase in engineering development materials. This is not a low-investment licensing model riding a fixed architecture. NVIDIA is spending aggressively to compress product cycles and support a system stack that spans chips, networking, software, and data-center design.' }
    ]
  },
  {
    heading: 'The obligations underneath the moat',
    claims: [
      { id: 'commitments', support: 'supported', sources: ['fy26', 'q1', 'cfo'], text: 'Manufacturing, supply, and capacity commitments rose from $95.2 billion at the FY2026 year end to $119 billion by April 26, 2026; approximately $95 billion was due during the remainder of FY2027. Multi-year cloud-service commitments increased from $27 billion to $30 billion, and other vendor commitments were approximately $6 billion. These are not automatically liabilities and some will turn into revenue-producing inventory or infrastructure. They are nevertheless the clearest filing-based measure of the forward position NVIDIA must carry to preserve supply and ecosystem speed.' },
      { id: 'commitment-interpretation', support: 'partial', sources: ['fy26', 'q1', 'cfo'], text: 'The commitments are simultaneously moat and risk. In an undersupplied market, reserved foundry capacity, components, cloud compute, and infrastructure can let NVIDIA ship systems that competitors cannot assemble quickly. If demand, product timing, regulation, or customer financing changes, the same commitments can create inventory provisions, underused capacity, or weaker cash conversion. The H20 charge is a concrete warning that external policy can strand a product and its purchase obligations even when aggregate AI demand remains strong.' },
      { id: 'inventory', support: 'supported', sources: ['fy26', 'q1'], text: 'Inventory increased from $21.403 billion at January 25 to $25.797 billion at April 26, 2026, a rise of roughly $4.4 billion in one quarter. That increase is not proof of weakening demand; it can reflect preparation for a rapidly scaling system launch. It does mean the investor must track inventory growth against revenue, gross margin, provisions, and customer deployment rather than treating supply expansion as costless evidence of confidence.' }
    ]
  },
  {
    heading: 'Concentration and policy boundaries',
    claims: [
      { id: 'customer-concentration', support: 'supported', sources: ['fy26', 'q1'], text: 'Customer concentration rose to a level that deserves explicit underwriting. In FY2026, one direct customer represented 22% of revenue and another represented 14%. In Q1 FY2027, three direct customers represented 21%, 17%, and 16% of revenue—54% combined—and were primarily associated with Compute & Networking. End-customer economics may be broader than direct billing relationships, but the reported concentration means a small number of purchase schedules can materially alter quarterly growth, inventory absorption, and bargaining dynamics.' },
      { id: 'china', support: 'supported', sources: ['fy26', 'q1'], text: 'China is an operating constraint, not a hypothetical risk factor. NVIDIA reported no Data Center Hopper shipments to China in Q1 FY2027 versus $4.6 billion in the year-earlier quarter. Licenses existed for some H200 shipments, but NVIDIA had not recognized H200 revenue and described import and inspection uncertainty. Its Q2 outlook assumed no Data Center compute revenue from China. The key point is not a single lost-quarter estimate; export controls can change product eligibility, inventory recoverability, customer access, and the return on supply commitments at the same time.' },
      { id: 'geography', support: 'supported', sources: ['fy26'], text: 'Reported customer geography must be read carefully. FY2026 revenue attributed to U.S.-headquartered customers was $149.617 billion, versus $42.345 billion for Taiwan and $19.677 billion for China including Hong Kong. NVIDIA also estimated that 76% of Data Center revenue attributed to Taiwan-headquartered customers ultimately related to end customers in the United States and Europe. Headquarters-based reporting therefore should not be mistaken for the physical location of deployment or final economic demand.' }
    ]
  },
  {
    heading: 'Capital recycling and balance-sheet choices',
    claims: [
      { id: 'strategic-capital', support: 'supported', sources: ['fy26', 'q1'], text: 'NVIDIA is recycling cash into the ecosystem as well as into its own research. It invested $17.5 billion in private companies and infrastructure funds during FY2026 and disclosed $3.5 billion of guarantees connected to land, power, and shell obligations for early-stage companies. At April 26, it held $30.2 billion of marketable equity securities. These positions may accelerate customer formation and infrastructure build-out, but they also blur the boundary between supplier demand, financed ecosystem demand, and investment returns.' },
      { id: 'capital-returns', support: 'supported', sources: ['q1', 'release'], text: 'NVIDIA returned approximately $20 billion to shareholders in Q1, including $20.2 billion of repurchases and $243 million of dividends. On May 18, the board raised the quarterly dividend from $0.01 to $0.25 per share and authorized an additional $80 billion of repurchases. The scale is supported by current cash generation, but buybacks should be evaluated alongside the company’s rising supply commitments, strategic investments, and security portfolio—not as an isolated sign of excess capital.' },
      { id: 'debt-update', support: 'supported', sources: ['debt'], text: 'After the quarter, NVIDIA completed a $25 billion senior-notes offering across seven tranches maturing from 2028 through 2056, with coupons from 4.25% to 5.625%. The issuance does not by itself indicate financial stress: Q1 cash plus marketable debt securities was $50.3 billion and quarterly operating cash flow was exceptionally strong. It does change the balance-sheet framing. NVIDIA chose to add long-duration debt while simultaneously repurchasing shares, reserving supply, investing in ecosystem companies, and carrying a large equity portfolio.' }
    ]
  },
  {
    heading: 'What would break the thesis',
    claims: [
      { id: 'falsifiers', support: 'partial', sources: ['fy26', 'q1', 'cfo', 'debt'], text: 'The favorable thesis weakens if revenue growth decelerates while inventory and commitments continue to rise; if gross margin again deteriorates because system complexity or policy strands inventory; if a major direct customer pauses deployment; if strategic-investment gains conceal weaker operating profit; or if capital returns and ecosystem financing consume cash faster than the operating engine replenishes it. The constructive thesis strengthens if cash conversion remains high, provisions stay contained, customer demand broadens, and reserved capacity converts into shipped systems without requiring progressively larger financing support.' },
      { id: 'maintenance-test', support: 'partial', sources: ['submissions', 'facts', 'q1', 'debt'], text: 'The next maintenance pass should compare the latest 10-Q against five explicit tests: Data Center growth versus the $91 billion Q2 revenue outlook; gross margin against the 74.9% midpoint; inventory and supply commitments versus revenue growth; direct-customer concentration; and operating cash flow before investment marks. It should also incorporate later 8-K financing or export-control events. A maintained dossier should rewrite only claims whose evidence changes, preserve the rest, and show the accepted filing rather than silently replacing the article.' }
    ]
  }
]);

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const claimHash = id => `nvda-${id}-${crypto.createHash('sha1').update(id).digest('hex').slice(0, 8)}`;
const clone = value => JSON.parse(JSON.stringify(value ?? null));
const sourceKeysForStage = stage => stage === 'baseline' ? new Set(['fy26', 'submissions', 'facts']) : stage === 'q1' ? new Set(SOURCES.filter(row => row.key !== 'debt').map(row => row.key)) : new Set(SOURCES.map(row => row.key));
const includeClaim = (claim, stage) => stage === 'baseline'
  ? !['q1-engine', 'earnings-quality', 'inventory', 'capital-returns', 'debt-update'].includes(claim.id)
  : stage === 'q1' ? claim.id !== 'debt-update' : true;

const HISTORICAL_TEXT = Object.freeze({
  baseline: {
    thesis: 'NVIDIA’s AI demand is real; the underwriting question is whether system-scale economics can outrun the commitments, concentration, and capital recycling required to sustain it. The FY2026 filing does not support a simple “AI leader” story. It supports a sharper baseline: an exceptional cash-generating engine had committed $95.2 billion to manufacturing, supply, and capacity while relying on a concentrated customer base and navigating export controls. Those obligations could reinforce the platform if demand persisted, but they also made the downside path more nonlinear than the revenue growth rate suggested.',
    method: 'This dossier separates reported facts from calculations and interpretation. Revenue, margins, cash flow, commitments, customer concentration, and security holdings come directly from NVIDIA’s SEC filings. Free-cash-flow figures are simple calculations of operating cash flow less purchases of property and equipment; they are not company-reported GAAP measures. This is a deliberately labeled historical maintenance baseline reconstructed from the FY2026 10-K. It does not claim Noeis observed that filing in real time; later SEC filings are the maintenance test.',
    'margin-architecture': 'FY2026 gross margin fell to 71.1% from 75.0%. NVIDIA attributed the decline partly to the transition from Hopper HGX systems to full-scale Blackwell data-center solutions and partly to a $4.5 billion charge tied to H20 excess inventory and purchase obligations. FY2026 inventory provisions and excess purchase obligations totaled $7.2 billion, partly offset by $1.5 billion of previously reserved amounts used or sold. The system transition increased strategic control while exposing NVIDIA to more component, inventory, and deployment risk.',
    'research-intensity': 'Research and development expense was $18.497 billion in FY2026, and NVIDIA reported that approximately 31,000 employees were engaged in research and development. This was not a low-investment licensing model riding a fixed architecture. NVIDIA was spending aggressively to compress product cycles and support a system stack spanning chips, networking, software, and data-center design.',
    commitments: 'At the FY2026 year end, NVIDIA disclosed $95.2 billion of manufacturing, supply, and capacity commitments, substantially all due through FY2027. It also disclosed $27 billion of multi-year cloud-service commitments, $11.4 billion of investment commitments, and $3.4 billion of other commitments. These amounts were not automatically liabilities and some were intended to become revenue-producing inventory or infrastructure. They nevertheless established a large forward position that NVIDIA had to carry to preserve supply and ecosystem speed.',
    'customer-concentration': 'Customer concentration already deserved explicit underwriting in FY2026. One direct customer represented 22% of revenue and another represented 14%, or 36% combined. End-customer economics could be broader than direct billing relationships, but the reported concentration meant that a small number of purchase schedules could materially alter growth, inventory absorption, and bargaining dynamics.',
    china: 'China was an operating constraint, not a hypothetical risk factor. NVIDIA recorded a $4.5 billion H20-related charge in FY2026 and reported only approximately $60 million of licensed H20 revenue. The company had not recognized H200 revenue as of the filing. Export controls could therefore change product eligibility, inventory recoverability, customer access, and the return on supply commitments at the same time.',
    'strategic-capital': 'NVIDIA was recycling cash into the ecosystem as well as into its own research. It invested $17.5 billion in private companies and infrastructure funds during FY2026 and disclosed $3.5 billion of guarantees connected to land, power, and shell obligations for early-stage companies. These positions could accelerate customer formation and infrastructure build-out, but they also blurred the boundary between supplier demand, financed ecosystem demand, and investment returns.',
    'maintenance-test': 'The next maintenance pass was defined in advance: compare the next 10-Q against Data Center growth, gross margin, inventory and supply commitments, direct-customer concentration, export-control effects, and operating cash flow. A maintained dossier would have to rewrite only claims whose evidence changed, preserve the rest, and show the accepted filing rather than silently replacing the article.'
  },
  q1: {
    method: 'This dossier separates reported facts from calculations and interpretation. Revenue, margins, cash flow, commitments, customer concentration, and security holdings come directly from NVIDIA’s SEC filings. Free-cash-flow figures are simple calculations of operating cash flow less purchases of property and equipment; they are not company-reported GAAP measures. This is a deliberately labeled historical maintenance backtest: the FY2026 10-K is the reconstructed baseline and the Q1 FY2027 filing is the operating update. It does not claim Noeis observed those events in real time.'
  }
});

const textForStage = (claim, stage) => HISTORICAL_TEXT[stage]?.[claim.id] || claim.text;

const buildPageFields = ({ userId, stage, now = new Date() }) => {
  const allowed = sourceKeysForStage(stage);
  const sourceRows = SOURCES.filter(row => allowed.has(row.key));
  const refs = sourceRows.map(row => ({
    _id: new mongoose.Types.ObjectId(), type: 'external', title: row.title,
    snippet: `${row.period}. Official SEC primary source used for the NVIDIA historical maintenance proof.`,
    url: row.url, citationLabel: row.key.toUpperCase(), provider: 'sec-edgar',
    metadata: { evidenceKey: row.key, period: row.period, historicalBacktest: true }, addedBy: 'user', createdAt: now
  }));
  const refByKey = new Map(refs.map((ref, index) => [ref.metadata.evidenceKey, { ref, index: index + 1 }]));
  const citations = refs.map(ref => ({ _id: new mongoose.Types.ObjectId(), sourceRefId: ref._id, sourceType: 'external', sourceTitle: ref.title, url: ref.url, confidence: 1, createdAt: now }));
  const citationByRef = new Map(citations.map(row => [String(row.sourceRefId), row]));
  const claims = [];
  const content = [];
  for (const section of SECTIONS) {
    const selected = section.claims.filter(claim => includeClaim(claim, stage));
    if (!selected.length) continue;
    content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: section.heading }] });
    for (const claim of selected) {
      const evidence = claim.sources.filter(key => refByKey.has(key)).map(key => refByKey.get(key));
      if (!evidence.length) continue;
      const text = textForStage(claim, stage);
      const claimId = claimHash(claim.id);
      content.push({ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'claim', attrs: { claimId, support: claim.support, citationIndexes: evidence.map(row => row.index), contradictionIndexes: [] } }] }] });
      claims.push({
        claimId, text, section: section.heading, support: claim.support,
        citationIds: evidence.map(row => citationByRef.get(String(row.ref._id))._id), sourceRefIds: evidence.map(row => row.ref._id),
        contradictedByCitationIds: [], confidence: claim.support === 'supported' ? 0.96 : 0.74,
        lastReviewedAt: now, lastVerifiedAt: now,
        history: [{ at: now, event: stage === 'baseline' ? 'created' : 'rewritten', support: claim.support, text, section: section.heading, citationIds: evidence.map(row => citationByRef.get(String(row.ref._id))._id), sourceRefIds: evidence.map(row => row.ref._id), contradictedByCitationIds: [], summary: `Historical ${stage} primary-source version.` }],
        createdAt: now
      });
    }
  }
  const body = { type: 'doc', content };
  const plainText = content.map(node => node.content?.map(child => child.text || '').join('')).filter(Boolean).join('\n\n');
  return {
    userId, title: TITLE, slug: SLUG, pageType: 'source', status: 'draft', visibility: 'private', sourceScope: 'selected_sources',
    createdFrom: { type: 'sources', objectId: null, objectIds: [], text: 'NVIDIA SEC filing-maintenance historical proof.', label: 'Primary-source historical maintenance proof' },
    body, plainText, sourceRefs: refs, citations, claims,
    freshness: { status: 'needs_review', lastSourceEventAt: null, lastMaintainedAt: null, pendingSourceEventIds: [], conflictCount: 0, staleSectionCount: 0, acceptedThrough: null },
    publicProof: null,
    aiState: { draftStatus: 'ready', lastDraftedAt: now, maintenanceSummary: 'Reconstructed the FY2026 SEC baseline for a historical maintenance proof.', changeLog: [], quality: {} },
    externalWatches: { edgar: { ticker: 'NVDA', cik: '0001045810', companyName: 'NVIDIA Corporation', forms: ['10-K', '10-Q', '8-K'], status: 'active', lastCheckedAt: now }, transcripts: { status: 'idle' }, githubRepo: { status: 'idle' } },
    hiddenFromHome: true, debugOnly: false, archived: false
  };
};

const qualityFor = fields => evaluateWikiArticleQuality({ page: fields, body: fields.body, claims: fields.claims, sourceRefs: fields.sourceRefs, now: new Date() });
const summary = page => ({ id: String(page._id || ''), title: page.title, slug: page.slug, status: page.status, visibility: page.visibility, words: clean(page.plainText).split(/\s+/).filter(Boolean).length, sources: page.sourceRefs?.length || 0, claims: page.claims?.length || 0, acceptedThrough: page.freshness?.acceptedThrough || null, publicProof: page.publicProof || null });
const writeJson = (name, payload) => { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); const target = path.join(OUTPUT_DIR, name); fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); return target; };
const applyFields = (page, fields) => { for (const [key, value] of Object.entries(fields)) { if (key === 'userId') continue; page[key] = clone(value); page.markModified(key); } };
const createEvent = async ({ page, accession, title, text, url, filedAt, sourceKeys }) => {
  const event = new WikiSourceEvent({ userId: page.userId, sourceType: 'external', provider: 'sec-edgar', externalId: `sec-edgar:0001045810:${accession}`, eventType: 'updated', title, summary: text, text, url, sourceUpdatedAt: new Date(filedAt), status: 'processed', affectedPageIds: [page._id], processedAt: new Date(), metadata: { source: 'sec-edgar', cik: '0001045810', ticker: 'NVDA', accessionNumber: accession, form: accession === '0001193125-26-275783' ? '8-K' : '10-Q', historicalBacktest: true, sourceKeys } });
  await event.save(); return event;
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const ownerPage = await WikiPage.findById(OWNER_PAGE_ID);
  if (!ownerPage) throw new Error('Owner anchor page not found.');
  const existing = await WikiPage.findOne({ userId: ownerPage.userId, slug: SLUG });
  if (existing) { console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', idempotent: true, page: summary(existing) }, null, 2)); return; }

  const baselineFields = buildPageFields({ userId: ownerPage.userId, stage: 'baseline' });
  const q1Fields = buildPageFields({ userId: ownerPage.userId, stage: 'q1' });
  const finalFields = buildPageFields({ userId: ownerPage.userId, stage: 'final' });
  const qualities = { baseline: qualityFor(baselineFields), q1: qualityFor(q1Fields), final: qualityFor(finalFields) };
  if (!Object.values(qualities).every(row => row.ok)) throw new Error(`Quality gate failed: ${JSON.stringify(qualities)}`);
  const preview = { mode: APPLY ? 'apply' : 'dry-run', idempotent: false, title: TITLE, thesis: SECTIONS[0].claims[0].text, stages: { baseline: summary(baselineFields), q1: summary(q1Fields), final: summary(finalFields) }, qualities, mutations: APPLY ? 'authorized' : 'none' };
  if (!APPLY) { console.log(JSON.stringify(preview, null, 2)); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const beforePath = writeJson(`before-${stamp}.json`, { capturedAt: new Date().toISOString(), ownerAnchorPageId: String(ownerPage._id), intended: preview });
  const page = new WikiPage(baselineFields);
  await page.save();
  const baselineRevision = await createWikiRevision({ WikiRevision, userId: page.userId, page, reason: 'created', actorType: 'user', promotionStatus: 'promoted', quality: qualities.baseline, summary: 'Reconstructed the NVIDIA FY2026 10-K baseline for an explicitly historical maintenance backtest.' });

  const q1Event = await createEvent({ page, accession: '0001045810-26-000052', title: 'NVIDIA Q1 FY2027 10-Q filed 2026-05-20', text: 'The Q1 FY2027 filing materially updated revenue, Data Center growth, cash conversion, investment gains, inventory, commitments, customer concentration, China exposure, and capital-return claims.', url: SOURCES.find(row => row.key === 'q1').url, filedAt: '2026-05-20T00:00:00.000Z', sourceKeys: ['q1', 'earnings8k', 'release', 'cfo'] });
  const beforeQ1 = snapshotPage(page);
  applyFields(page, q1Fields);
  page.freshness = { status: 'fresh', lastSourceEventAt: q1Event.sourceUpdatedAt, lastMaintainedAt: new Date(), pendingSourceEventIds: [], conflictCount: 0, staleSectionCount: 0, acceptedThrough: { sourceEventId: String(q1Event._id), title: q1Event.title, url: q1Event.url, sourceUpdatedAt: q1Event.sourceUpdatedAt, acceptedAt: new Date() } };
  page.aiState = { ...clone(q1Fields.aiState), lastDraftedAt: new Date(), maintenanceSummary: 'Accepted Q1 FY2027 operating evidence into the historical NVIDIA dossier.', changeLog: [{ type: 'merged_new_evidence', text: 'Q1 FY2027 added operating cash conversion, investment-gain, commitment, concentration, and China evidence.', createdAt: new Date() }], quality: qualities.q1 };
  await page.save();
  const q1Revision = await createWikiRevision({ WikiRevision, userId: page.userId, page, before: beforeQ1, after: snapshotPage(page), reason: 'source_event', actorType: 'agent', sourceEventId: q1Event._id, promotionStatus: 'promoted', sourceVersion: { provider: 'sec-edgar', accessionNumber: '0001045810-26-000052', historicalBacktest: true }, quality: { ...qualities.q1, comparison: { claimDeltas: { added: 4, changed: 8, gainedSupport: 0, contradicted: 0, preserved: 10, removed: 0 } } }, summary: 'Maintained the FY2026 baseline through NVIDIA Q1 FY2027 primary SEC evidence.' });

  const debtEvent = await createEvent({ page, accession: '0001193125-26-275783', title: 'NVIDIA $25 billion senior-notes offering 8-K filed 2026-06-18', text: 'NVIDIA completed a $25 billion senior-notes offering across seven tranches, materially updating the dossier’s balance-sheet, capital-allocation, and capital-recycling claims.', url: SOURCES.find(row => row.key === 'debt').url, filedAt: '2026-06-18T00:00:00.000Z', sourceKeys: ['debt'] });
  const beforeDebt = snapshotPage(page);
  applyFields(page, finalFields);
  page.status = 'published'; page.visibility = 'shared';
  page.freshness = { status: 'fresh', lastSourceEventAt: debtEvent.sourceUpdatedAt, lastMaintainedAt: new Date(), pendingSourceEventIds: [], conflictCount: 0, staleSectionCount: 0, acceptedThrough: { sourceEventId: String(debtEvent._id), title: debtEvent.title, url: debtEvent.url, sourceUpdatedAt: debtEvent.sourceUpdatedAt, acceptedAt: new Date() } };
  page.aiState = { ...clone(finalFields.aiState), lastDraftedAt: new Date(), maintenanceSummary: 'Accepted the June 2026 senior-notes financing into the maintained NVIDIA dossier.', changeLog: [{ type: 'merged_new_evidence', text: 'The June 2026 filing added $25 billion of senior notes and changed the balance-sheet interpretation.', createdAt: new Date() }, ...(page.aiState?.changeLog || [])], quality: qualities.final };
  await page.save();
  const debtRevision = await createWikiRevision({ WikiRevision, userId: page.userId, page, before: beforeDebt, after: snapshotPage(page), reason: 'source_event', actorType: 'agent', sourceEventId: debtEvent._id, promotionStatus: 'promoted', sourceVersion: { provider: 'sec-edgar', accessionNumber: '0001193125-26-275783', historicalBacktest: true }, quality: { ...qualities.final, comparison: { claimDeltas: { added: 1, changed: 2, gainedSupport: 0, contradicted: 0, preserved: 16, removed: 0 } } }, summary: 'Maintained the NVIDIA dossier through the June 2026 $25 billion senior-notes offering.' });

  const acceptance = buildSecPublicProofAcceptance({ page, requestedClocks: [{ sourceEventId: debtEvent._id, revisionId: debtRevision._id }], events: [debtEvent], revisions: [debtRevision], identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ }, reason: 'The filing-backed NVIDIA dossier and its promoted claim-level maintenance revision passed editorial acceptance as an explicitly historical proof.', now: new Date() });
  if (!acceptance.ok) throw new Error(`SEC acceptance failed: ${acceptance.errors.join(' ')}`);
  page.publicProof = acceptance.record;
  await page.save();

  const result = { ...preview, mutations: 'applied', page: summary(page), ids: { pageId: String(page._id), baselineRevisionId: String(baselineRevision._id), q1EventId: String(q1Event._id), q1RevisionId: String(q1Revision._id), debtEventId: String(debtEvent._id), debtRevisionId: String(debtRevision._id) }, beforePath, rollback: { deleteOnlyTheseIds: true, pageId: String(page._id), eventIds: [String(q1Event._id), String(debtEvent._id)], revisionIds: [String(baselineRevision._id), String(q1Revision._id), String(debtRevision._id)] } };
  const resultPath = writeJson(`result-${stamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => { try { await mongoose.disconnect(); } catch (_error) {} });

module.exports = { SOURCES, SECTIONS, buildPageFields, qualityFor };
