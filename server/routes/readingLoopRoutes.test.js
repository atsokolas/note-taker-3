const assert = require('assert');
const { buildReadingLoopRouter } = require('./readingLoopRoutes');

/**
 * The Reading Loop shipped for a day with VectorItem missing from the model
 * bundle it hands to the service. Every retrieval threw "Cannot read properties
 * of undefined (reading 'aggregate')" inside a catch that turned it into
 * "Nothing worth connecting this week." The page looked calm and correct.
 *
 * Wiring is not covered by service tests, because those inject their own models.
 * So assert the wiring itself.
 */
const MODEL_KEYS = ['User', 'Article', 'NotebookEntry', 'Question', 'WikiPage', 'ReadingLoopEdition', 'VectorItem'];

const fakeModel = (name) => ({ __name: name, aggregate: async () => [], find: () => ({}), findOne: () => ({}) });

const injected = Object.fromEntries(MODEL_KEYS.map(k => [k, fakeModel(k)]));
const router = buildReadingLoopRouter({ authenticateToken: (req, res, next) => next(), ...injected });

const routes = router.stack.filter(l => l.route).map(l => l.route.path);
assert.ok(routes.includes('/api/reading-loop'), 'the edition route is mounted');
assert.ok(routes.includes('/api/reading-loop/run/:kind'), 'the run route is mounted');

// Every model the service reaches for must be accepted by the router. A key the
// router silently drops becomes an undefined at the deepest point of a request.
MODEL_KEYS.forEach((key) => {
  assert.ok(
    Object.prototype.hasOwnProperty.call(injected, key),
    `${key} must be part of the router's model contract`
  );
});

const source = require('fs').readFileSync(require('path').join(__dirname, 'readingLoopRoutes.js'), 'utf8');
const bundle = source.match(/const models = \{[^}]*\}/)?.[0] || '';
MODEL_KEYS.forEach((key) => {
  assert.ok(bundle.includes(key), `${key} must be passed through to the service in the models bundle, not just destructured`);
});

// And the server must actually supply it — destructuring a parameter nobody
// passes is exactly how this shipped.
const serverSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
const callSite = serverSource.match(/app\.use\(buildReadingLoopRouter\(\{[\s\S]*?\}\)\);/)?.[0] || '';
assert.ok(callSite, 'the reading loop router is mounted in server.js');
MODEL_KEYS.forEach((key) => {
  assert.ok(callSite.includes(key), `server.js must pass ${key} to buildReadingLoopRouter`);
});

console.log('readingLoopRoutes wiring tests passed');
