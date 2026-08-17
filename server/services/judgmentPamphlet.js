// One claim, on one page, that you can hand to someone.
//
// A judgment lives behind a login, which makes it hard to be held to. The
// pamphlet is the same four sections printed on a single sheet: the claim, why
// you believe it, what argues against it, what would change your mind, and
// what you did about it — with the publications named underneath. Nothing is
// summarised and nothing is added; if a section is empty on the page it is
// empty here too.
//
// The projection deliberately mirrors the Judgment page's read model
// (note-taker-ui/src/pages/judgmentModel.js), including its fallbacks for the
// older dossier shape. The two are kept honest by a test that runs both over
// the same fixtures and compares them; if you change one, that test tells you
// to change the other.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => clean(value?._id || value?.id || value);

const reasonLines = (items, prefix) => list(items)
  .map((item, index) => ({
    id: clean(item?.reasonId) || `${prefix}:${index}`,
    text: clean(item?.text),
    sourceRefIds: list(item?.sourceRefIds),
    sourceLabel: clean(item?.sourceLabel)
  }))
  .filter(line => line.text);

/* Pages written by the older dossier surfaces only have `assumptions` and the
   single `strongestCounterargument`; those read as the same two fields rather
   than printing a blank sheet over a storage detail. */
const whyLines = (judgment = {}) => {
  const own = reasonLines(judgment.why, 'why');
  if (own.length) return own;
  return list(judgment.assumptions)
    .filter(item => clean(item?.status) !== 'failed')
    .map((item, index) => ({
      id: clean(item?.assumptionId) || `assumption:${index}`,
      text: clean(item?.text),
      sourceRefIds: list(item?.sourceRefIds),
      sourceLabel: ''
    }))
    .filter(line => line.text);
};

const againstLines = (judgment = {}) => {
  const own = reasonLines(judgment.against, 'against');
  if (own.length) return own;
  const counter = clean(judgment.strongestCounterargument);
  return counter ? [{ id: 'strongest-counterargument', text: counter, sourceRefIds: [], sourceLabel: '' }] : [];
};

const changeMindLines = (judgment = {}) => list(judgment.falsifiers)
  .filter(item => clean(item?.status) !== 'retired')
  .map((item, index) => ({ id: clean(item?.falsifierId) || `falsifier:${index}`, text: clean(item?.text) }))
  .filter(line => line.text);

const whatIDidLines = (judgment = {}) => list(judgment.decisions)
  .map((item, index) => ({
    id: clean(item?.decisionId) || `decision:${index}`,
    text: clean(item?.summary),
    at: item?.decidedAt || item?.createdAt || null,
    order: index
  }))
  .filter(line => line.text)
  .sort((left, right) => {
    const delta = (new Date(left.at || 0).getTime() || 0) - (new Date(right.at || 0).getTime() || 0);
    return Number.isNaN(delta) || delta === 0 ? left.order - right.order : delta;
  });

const sourceLabel = (ref) => clean(ref?.citationLabel) || clean(ref?.provider) || clean(ref?.title);

/** The publications named under a section — not a citation apparatus. */
const resolveSources = (page, lines = []) => {
  const byId = new Map(list(page?.sourceRefs).map(ref => [idOf(ref), ref]));
  const seen = new Set();
  const resolved = [];
  lines.forEach((line) => {
    list(line.sourceRefIds).map(idOf).forEach((refId) => {
      const label = sourceLabel(byId.get(refId));
      if (!label || seen.has(label)) return;
      seen.add(label);
      resolved.push(label);
    });
    const literal = clean(line.sourceLabel);
    if (literal && !seen.has(literal)) {
      seen.add(literal);
      resolved.push(literal);
    }
  });
  return resolved;
};

const claimSentence = (page) => (
  clean(page?.judgment?.currentJudgment)
  || clean(page?.judgment?.governingQuestion)
  || clean(page?.title)
);

const projectPamphlet = (page) => {
  const judgment = page?.judgment || {};
  const why = whyLines(judgment);
  const against = againstLines(judgment);
  return {
    id: idOf(page),
    claim: claimSentence(page),
    why,
    whySources: resolveSources(page, why),
    against,
    againstSources: resolveSources(page, against),
    changeMindIf: changeMindLines(judgment),
    whatIDid: whatIDidLines(judgment)
  };
};

const SERIF = 'Times-Roman';
const SERIF_ITALIC = 'Times-Italic';
const SANS = 'Helvetica';

/* Printed in UTC. A date stored as midnight UTC formatted in the server's own
   zone comes out as the day before, so a decision taken on the 2nd printed as
   the 1st — a ledger line that is wrong about when it happened. */
const formatDate = (value) => {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || !time) return '';
  return new Date(time).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
};

/* One sheet. An empty section is absent — the same rule the page follows,
   because a pamphlet with four headings and one line under them advertises
   what the author has not done rather than what they think. */
const renderPamphlet = (doc, pamphlet, { printedAt = new Date() } = {}) => {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rule = () => {
    doc.moveDown(0.6);
    const y = doc.y;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + width, y)
      .strokeColor('#d9d3c7').lineWidth(0.5).stroke();
    doc.moveDown(0.7);
  };

  doc.font(SANS).fontSize(8).fillColor('#8a8377').text('NOEIS · A JUDGMENT', { characterSpacing: 1.2 });
  doc.moveDown(1.1);

  doc.font(SERIF).fontSize(21).fillColor('#1c1a17').text(pamphlet.claim || 'Untitled claim', { lineGap: 3 });

  const section = (label, lines, sources = []) => {
    if (!lines.length) return;
    rule();
    doc.font(SANS).fontSize(8).fillColor('#8a8377').text(label.toUpperCase(), { characterSpacing: 1.1 });
    doc.moveDown(0.45);
    doc.font(SERIF).fontSize(11).fillColor('#26231f');
    lines.forEach((line) => {
      doc.text(line.text, { lineGap: 2.2 });
      doc.moveDown(0.3);
    });
    if (sources.length) {
      doc.moveDown(0.1);
      doc.font(SERIF_ITALIC).fontSize(9).fillColor('#6f685c').text(sources.join(' · '));
    }
  };

  section('Why', pamphlet.why, pamphlet.whySources);
  section('Against', pamphlet.against, pamphlet.againstSources);
  section("I'd change my mind if", pamphlet.changeMindIf);
  section('What I did', pamphlet.whatIDid.map(line => ({
    ...line,
    text: formatDate(line.at) ? `${formatDate(line.at)} — ${line.text}` : line.text
  })));

  rule();
  doc.font(SANS).fontSize(8).fillColor('#8a8377')
    .text(`Printed ${formatDate(printedAt)}. This is what I thought and why; the reasons are the argument, not the conclusion.`, {
      lineGap: 2
    });
};

/** The whole sheet as a buffer. */
const buildPamphletPdf = ({ PDFDocument, page, printedAt = new Date() }) => new Promise((resolve, reject) => {
  const pamphlet = projectPamphlet(page);
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  try {
    renderPamphlet(doc, pamphlet, { printedAt });
    doc.end();
  } catch (error) {
    reject(error);
  }
});

module.exports = { buildPamphletPdf, projectPamphlet, renderPamphlet };
