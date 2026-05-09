#!/usr/bin/env node
require('dotenv').config();

const { runWikiMaintenanceQualityHarness } = require('../server/services/wikiMaintenanceQualityHarness');

const parseFixtures = (argv = []) => argv
  .filter(arg => arg.startsWith('--fixture='))
  .flatMap(arg => arg.slice('--fixture='.length).split(','))
  .map(value => value.trim())
  .filter(Boolean);

const parseArgs = (argv = []) => ({
  selectedFixtures: parseFixtures(argv),
  includeLive: argv.includes('--live'),
  requireLive: argv.includes('--require-live')
});

const main = async () => {
  const result = await runWikiMaintenanceQualityHarness(parseArgs(process.argv.slice(2)));
  console.log('wiki maintenance quality harness');
  console.log(`passed=${result.passed}/${result.total} skipped=${result.skipped || 0}`);
  result.results.forEach((row) => {
    const status = row.skipped ? 'SKIP' : row.ok ? 'PASS' : 'FAIL';
    console.log(`${status} ${row.name}`);
    if (row.claim) {
      console.log(`  - claim support=${row.claim.support} citations=${row.claim.citationIds.length} contradictions=${row.claim.contradictedByCitationIds.length}`);
    }
    if (row.model) console.log(`  - model=${row.model}`);
    console.log(`  - graph edges=${row.edgeCount}`);
    row.failures.forEach(failure => console.log(`  ! ${failure}`));
  });
  if (!result.ok) process.exit(1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
