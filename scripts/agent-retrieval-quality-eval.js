#!/usr/bin/env node
/**
 * Lightweight retrieval-quality eval for agent/question evidence paths.
 * Run: node scripts/agent-retrieval-quality-eval.js
 */
const assert = require('assert');
const {
  sanitizeRetrievalSnippet,
  classifyQuestionEvidenceTone,
  isBoilerplateRetrievalSentence
} = require('../server/utils/retrievalSanitizer');
const {
  prepareRelatedItemsForReply
} = require('../server/services/collaborativeAgentService').__testables;

const newsletterRow = {
  objectType: 'highlight',
  objectId: 'h1',
  title: 'Newsletter',
  snippet: 'Welcome to the newsletter. Subscribe at https://substack.com/post?utm_source=email'
};

const substantiveRow = {
  objectType: 'highlight',
  objectId: 'h2',
  title: 'Margin pressure',
  snippet: 'However, operating margins compress when input costs rise faster than pricing power.'
};

const prepared = prepareRelatedItemsForReply([newsletterRow, substantiveRow], 6);
assert.ok(
  prepared.some((item) => String(item.snippet || '').includes('margins')),
  'prepareRelatedItemsForReply keeps substantive evidence'
);
assert.ok(
  !prepared.some((item) => /utm_source=newsletter/i.test(String(item.snippet || ''))),
  'prepareRelatedItemsForReply drops newsletter boilerplate'
);

const sanitized = sanitizeRetrievalSnippet(substantiveRow.snippet);
assert.strictEqual(classifyQuestionEvidenceTone(sanitized), 'counter');
assert.ok(!isBoilerplateRetrievalSentence(sanitized));

console.log('agent-retrieval-quality-eval: ok');
