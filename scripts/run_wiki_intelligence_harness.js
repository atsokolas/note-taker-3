#!/usr/bin/env node
require('dotenv').config();

const { runWikiIntelligenceHarness } = require('../server/services/wikiIntelligenceHarness');

const parseFixtures = (argv = []) => argv
  .filter(arg => arg.startsWith('--fixture='))
  .flatMap(arg => arg.slice('--fixture='.length).split(','))
  .map(value => value.trim())
  .filter(Boolean);

const parseArgs = (argv = []) => ({
  selectedFixtures: parseFixtures(argv),
  includeJudge: argv.includes('--judge-live'),
  requireJudge: argv.includes('--require-judge'),
  judgeAll: argv.includes('--judge-all')
});

const main = async () => {
  const result = await runWikiIntelligenceHarness(parseArgs(process.argv.slice(2)));
  console.log('wiki intelligence harness');
  console.log(`passed=${result.passed}/${result.total}`);
  result.results.forEach((row) => {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.name}`);
    if (row.proposals) {
      row.proposals.forEach((proposal) => {
        console.log(`  - ${proposal.status}/${proposal.action} ${proposal.title} score=${proposal.score.toFixed(2)}`);
      });
    }
    if (row.create) {
      console.log(`  - create sections=${row.create.headingSignature}`);
      console.log(`  - create claims=${row.create.claimCount} cited=${row.create.citedClaimCount} sources=${row.create.sourceRefCount} graph=${row.create.graphRowCount}`);
    }
    if (row.maintain) {
      console.log(`  - maintain sections=${row.maintain.headingSignature}`);
      console.log(`  - maintain claims=${row.maintain.claimCount} cited=${row.maintain.citedClaimCount} sources=${row.maintain.sourceRefCount} graph=${row.maintain.graphRowCount}`);
    }
    if (row.sourceEvent) {
      console.log(`  - source-event ${row.sourceEvent.status} provider=${row.sourceEvent.provider} pages=${row.sourceEvent.pages || 1} graph=${row.sourceEvent.graphRows}`);
    }
    if (Array.isArray(row.maintainedPages) && row.maintainedPages.length > 1) {
      row.maintainedPages.forEach((quality, index) => {
        console.log(`  - page ${index + 1} sections=${quality.headingSignature}`);
        console.log(`  - page ${index + 1} claims=${quality.claimCount} cited=${quality.citedClaimCount} sources=${quality.sourceRefCount} graph=${quality.graphRowCount}`);
      });
    }
    [row.create, row.maintain].filter(Boolean).forEach((quality) => {
      if (!quality.judge) return;
      const status = quality.judge.skipped ? 'skipped' : quality.judge.ok ? 'pass' : 'fail';
      console.log(`  - judge ${status} overall=${Number(quality.judge.overall || 0).toFixed(2)} model=${quality.judge.model || ''}`);
    });
    (row.expectedFailures || []).forEach(failure => console.log(`  - expected failure: ${failure}`));
    row.failures.forEach(failure => console.log(`  ! ${failure}`));
  });
  if (!result.ok) process.exit(1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
