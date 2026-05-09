#!/usr/bin/env node
const { runWikiProposalQualityHarness } = require('../server/services/wikiProposalQualityHarness');

const parseFixtures = (argv = []) => argv
  .filter(arg => arg.startsWith('--fixture='))
  .flatMap(arg => arg.slice('--fixture='.length).split(','))
  .map(value => value.trim())
  .filter(Boolean);

const main = () => {
  const result = runWikiProposalQualityHarness({ selectedFixtures: parseFixtures(process.argv.slice(2)) });
  console.log('wiki proposal quality harness');
  console.log(`passed=${result.passed}/${result.total}`);
  result.results.forEach((row) => {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.name}`);
    row.decisions.forEach((decision) => {
      console.log(`  - ${decision.status}/${decision.action} ${decision.title} score=${decision.score.toFixed(2)}`);
    });
    row.failures.forEach(failure => console.log(`  ! ${failure}`));
  });
  if (!result.ok) process.exit(1);
};

main();
