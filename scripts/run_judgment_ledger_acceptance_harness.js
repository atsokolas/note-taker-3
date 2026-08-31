#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { auditJudgmentLedgerJourney } = require('../server/services/judgmentLedgerAcceptanceService');

const inputFlag = process.argv.find(value => value.startsWith('--input='));
const inputPath = inputFlag
  ? path.resolve(process.cwd(), inputFlag.slice('--input='.length))
  : path.join(__dirname, 'fixtures', 'judgment-ledger-journey.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const result = auditJudgmentLedgerJourney(input);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
