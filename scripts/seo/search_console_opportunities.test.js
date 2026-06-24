const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseSearchConsolePaste,
  buildSearchConsoleOpportunityReport,
  buildSearchOpportunityExecutionBrief,
  runCli
} = require('./search_console_opportunities');

const sample = [
  'Query\tPage\tClicks\tImpressions\tCTR\tPosition',
  'ai second brain\thttps://www.noeis.io/ai-second-brain\t14\t620\t2.3%\t8.1',
  'readwise alternative\thttps://www.noeis.io/\t2\t144\t1.4%\t15.8',
  'how to turn highlights into concepts\thttps://www.noeis.io/personal-knowledge-management-ai\t5\t91\t5.5%\t9.2',
  'noeis jobs\thttps://www.noeis.io/\t0\t11\t0%\t41.0'
].join('\n');

const parsed = parseSearchConsolePaste(sample);
assert.deepStrictEqual(parsed.errors, []);
assert.strictEqual(parsed.rows.length, 4);
assert.strictEqual(parsed.rows[0].query, 'ai second brain');

const report = buildSearchConsoleOpportunityReport({
  input: sample,
  dateRange: 'Last 28 days'
});
assert.strictEqual(report.rowCount, 4);
assert.strictEqual(report.recommendations.improve.length, 2);
assert.strictEqual(report.recommendations.create.length, 1);
assert.strictEqual(report.recommendations.ignore.length, 1);

const brief = buildSearchOpportunityExecutionBrief(report);
assert.match(brief, /# Noeis Search Opportunity Brief/);
assert.match(brief, /Highest-value action:/);
assert.match(brief, /After deploy, check Marketing Analytics/);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-gsc-'));
const exportPath = path.join(tempDir, 'latest.tsv');
const outPath = path.join(tempDir, 'brief.md');
fs.writeFileSync(exportPath, sample);

const previousStdoutWrite = process.stdout.write;
let stdout = '';
process.stdout.write = chunk => {
  stdout += chunk;
  return true;
};

try {
  const exitCode = runCli(['--file', exportPath, '--out', outPath, '--date-range', 'Last 28 days']);
  assert.strictEqual(exitCode, 0);
  assert.match(stdout, /Wrote Search Console opportunity brief/);
  assert.match(fs.readFileSync(outPath, 'utf8'), /Rows analyzed: 4/);
} finally {
  process.stdout.write = previousStdoutWrite;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('search_console_opportunities tests passed');
