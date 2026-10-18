// Pages maintenance never rewrites. A note settled from Think is the reader's
// own finished words; only settling again changes them.
const HUMAN_ONLY_WIKI_LABEL_PATTERN = /^(?:weekend-readings|this-week-in-ai|research-ledger|settled-note|settled-concept):/;
const RESEARCH_LEDGER_LABEL_PATTERN = /^research-ledger:/;

const labelOf = page => String(page?.createdFrom?.label || '');
const isWeekendReadingsPage = page => labelOf(page).startsWith('weekend-readings:');
const isResearchEditionPage = page => /^(?:weekend-readings|this-week-in-ai):/.test(labelOf(page));
const isResearchOperatingLedgerPage = page => labelOf(page).startsWith('research-ledger:');
const isHumanOnlyWikiArtifact = page => HUMAN_ONLY_WIKI_LABEL_PATTERN.test(labelOf(page));

module.exports = {
  HUMAN_ONLY_WIKI_LABEL_PATTERN,
  RESEARCH_LEDGER_LABEL_PATTERN,
  isHumanOnlyWikiArtifact,
  isResearchEditionPage,
  isResearchOperatingLedgerPage,
  isWeekendReadingsPage
};
