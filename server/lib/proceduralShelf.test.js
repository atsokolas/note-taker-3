const assert = require('assert');
const { isProceduralShelf } = require('./proceduralShelf');

assert.strictEqual(isProceduralShelf('Needs Review'), true);
assert.strictEqual(isProceduralShelf('Inbox'), true);
assert.strictEqual(isProceduralShelf('Newsletters'), false);
assert.strictEqual(isProceduralShelf('Investing & Capital Allocation'), false);

console.log('proceduralShelf tests passed');
