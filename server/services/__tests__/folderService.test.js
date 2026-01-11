const assert = require('assert');
const { mergeFolderCounts } = require('../folderService');

const run = () => {
  const folders = [
    { _id: 'a1', name: 'Work', parentFolderId: null, sortOrder: 1 },
    { _id: 'b2', name: 'Reading', parentFolderId: null }
  ];
  const counts = [
    { _id: 'a1', articleCount: 3 }
  ];

  const result = mergeFolderCounts(folders, counts);

  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(Object.keys(result[0]).sort(), [
    '_id',
    'articleCount',
    'name',
    'parentFolderId',
    'sortOrder'
  ]);
  assert.strictEqual(result[0].articleCount, 3);
  assert.strictEqual(result[1].articleCount, 0);
  assert.strictEqual(result[1].parentFolderId, null);
};

if (require.main === module) {
  run();
  console.log('folderService mergeFolderCounts test passed');
}

module.exports = { run };
