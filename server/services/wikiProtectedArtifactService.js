const HUMAN_ONLY_WIKI_LABEL_PATTERN = /^(?:weekend-readings|research-ledger):/;
const RESEARCH_LEDGER_LABEL_PATTERN = /^research-ledger:/;

const labelOf = page => String(page?.createdFrom?.label || '');
const isWeekendReadingsPage = page => labelOf(page).startsWith('weekend-readings:');
const isResearchOperatingLedgerPage = page => labelOf(page).startsWith('research-ledger:');
const isHumanOnlyWikiArtifact = page => HUMAN_ONLY_WIKI_LABEL_PATTERN.test(labelOf(page));

module.exports = {
  HUMAN_ONLY_WIKI_LABEL_PATTERN,
  RESEARCH_LEDGER_LABEL_PATTERN,
  isHumanOnlyWikiArtifact,
  isResearchOperatingLedgerPage,
  isWeekendReadingsPage
};
