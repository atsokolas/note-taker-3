/* Which imports a desktop's `capture` token may use: a link, a file, and a
   piece of text, and no other door. */
const assert = require('assert');
const { buildImportRouter } = require('../importRoutes');

const authenticateToken = (_req, _res, next) => next();
const authenticateCapture = (_req, _res, next) => next();
const router = buildImportRouter({
  authenticateToken,
  authenticateCapture,
  upload: { single: () => (_req, _res, next) => next() },
  slugify: value => value,
  Article: {},
  trackEvent: () => {},
  EVENT_NAMES: {},
  crypto: {},
  TagMeta: {},
  NotebookEntry: {}
});

const guards = router.stack
  .filter(layer => layer.route?.methods.post)
  .map(layer => [layer.route.path, layer.route.stack[0].handle]);
const captureDoors = guards.filter(([, guard]) => guard === authenticateCapture).map(([path]) => path).sort();

assert.deepStrictEqual(captureDoors, ['/api/import/files', '/api/import/text', '/api/import/url']);
assert.ok(guards.some(([path, guard]) => path === '/api/import/readwise/sync' && guard === authenticateToken),
  'everything else still needs a person');

console.log('import capture doors: ok');
