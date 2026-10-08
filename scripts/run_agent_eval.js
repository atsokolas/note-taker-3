#!/usr/bin/env node
// Asks the thought partner real questions about a seeded library and scores
// the answers. With a model configured in .env it measures the model path;
// without one it measures what readers get when the model is unavailable.
//
//   npm run agent:eval                     report
//   npm run agent:eval -- --check          exit 1 if any rate falls below the baseline
//   npm run agent:eval -- --update-baseline
//   npm run agent:eval -- --case=summary,hiring --verbose
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runAgentEval } = require('../server/agentEval/runEval');

const BASELINE_PATH = path.join(__dirname, '..', 'server', 'agentEval', 'baseline.json');
const REPORT_DIR = path.join(__dirname, '..', 'tmp', 'agent-eval');

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=')[1] || '';

const readBaseline = () => {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch (_error) {
    return null;
  }
};

const failedChecks = item => Object.entries(item.checks).filter(([, ok]) => !ok).map(([name]) => name);

const main = async () => {
  const baseline = readBaseline();
  const verbose = flag('verbose');
  const run = await runAgentEval({
    only: option('case').split(',').filter(Boolean),
    baseline,
    onCase: item => {
      const status = item.pass ? 'pass' : `fail  ${failedChecks(item).join(', ')}`;
      console.log(`${item.id.padEnd(24)} ${String(item.mode || '-').padEnd(14)} ${status}`);
      if (verbose) console.log(`    ${item.reply.replace(/\s+/g, ' ').slice(0, 400)}\n`);
    }
  });

  const { summary } = run;
  console.log(`\n${summary.passed}/${summary.total} passed`);
  Object.entries(summary.checks).forEach(([name, value]) => console.log(`  ${name.padEnd(20)} ${value}`));
  console.log(`  ${'modelAnswered'.padEnd(20)} ${summary.modelAnswered}`);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`\nReport: ${path.relative(process.cwd(), reportPath)}`);

  if (flag('update-baseline')) {
    const { checks, passRate, passed, total, modelAnswered } = summary;
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({ passed, total, passRate, checks, modelAnswered }, null, 2)}\n`);
    console.log('Baseline updated.');
  }
  if (flag('check') && run.regressions.length) {
    run.regressions.forEach(({ name, now, before }) => console.error(`Regressed: ${name} ${before} → ${now}`));
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
