/* Lines the wiki maintenance writes about a page rather than about its
   subject (the fallback page in wikiMaintenanceService included): process
   artifacts, not positions. Nothing should read one back as something the
   reader believes, or connect a source to a page because of one. */
const CLAIM_META_RE = /\b(the recurring pattern across|the page should|this page|the useful claim is narrower|topic label|source ledger|maintenance (run|pass)|should not be read as a complete answer|the current evidence base|(stronger|enough) source material)\b/i;

module.exports = { CLAIM_META_RE };
