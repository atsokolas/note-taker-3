#!/usr/bin/env node
// Builds the pages Noeis has to be able to make (an NVIDIA and a Costco
// dossier, a first wiki page from three links) through the app's own routes,
// then scores what a reader would check before sharing them: claims that cite
// a source, figures the cited source states, quotations that exist, how far
// behind the latest filing, app vocabulary in the prose, and (with a model)
// whether each claim's source supports it.
//
// Needs the network and a model in .env. Never touches MONGODB_URI.
//
//   npm run wiki:eval
//   npm run wiki:eval -- --case=nvidia,first-page --no-judge
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runPageEval } = require('../server/pageEval/runEval');

const args = process.argv.slice(2);
const option = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=')[1] || '';
const REPORT_DIR = path.join(__dirname, '..', 'tmp', 'page-eval');
const pct = value => (value === null || value === undefined ? '  -' : `${Math.round(value * 100)}%`.padStart(4));

const line = (result) => {
  if (!result.score) return `${result.id.padEnd(18)} no page (${result.status || '-'} ${result.error || ''})`;
  const { score, support } = result;
  return [
    result.id.padEnd(18),
    (result.kept ? 'kept   ' : 'refused'),
    `${String(score.words).padStart(5)}w`,
    `claims ${String(score.claims).padStart(3)}`,
    `cited ${pct(score.citedShare)}`,
    `figures in source ${pct(score.figures.statedShare)} of ${score.figures.checkable}`,
    `supported ${pct(support?.supportedShare)}`,
    `behind ${score.daysBehindLatestFiling ?? '-'}d`,
    `leaks ${score.leaks.length}`,
    `${result.seconds}s`
  ].join('  ');
};

const main = async () => {
  const results = await runPageEval({
    only: option('case').split(',').filter(Boolean),
    judge: !args.includes('--no-judge'),
    onCase: result => console.log(line(result))
  });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nReport: ${path.relative(process.cwd(), reportPath)}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
