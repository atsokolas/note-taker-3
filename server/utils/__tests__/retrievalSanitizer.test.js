const assert = require('assert');
const {
  sanitizeRetrievalSnippet,
  stripTrackingUrls,
  isBoilerplateRetrievalSentence,
  classifyQuestionEvidenceTone
} = require('../retrievalSanitizer');

assert.strictEqual(
  stripTrackingUrls('See https://example.com?utm_source=newsletter&ref=abc for more.'),
  'See for more.'
);

assert.strictEqual(
  sanitizeRetrievalSnippet('Welcome to the newsletter. Subscribe at https://beehiiv.com/foo?utm_campaign=x'),
  ''
);

assert.ok(
  sanitizeRetrievalSnippet('Portfolio concentration increases when a few positions dominate total exposure and risk.'),
  'substantive sentence survives sanitization'
);

assert.strictEqual(
  classifyQuestionEvidenceTone('However, the margin profile weakens when input costs rise.'),
  'counter'
);

assert.strictEqual(
  classifyQuestionEvidenceTone('This evidence supports the thesis because demand remains durable.'),
  'support'
);

assert.ok(isBoilerplateRetrievalSentence('Hi friends — welcome to Not Boring'));

console.log('retrievalSanitizer.test.js: ok');
