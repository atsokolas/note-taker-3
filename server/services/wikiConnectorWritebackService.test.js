const assert = require('assert');

const {
  tiptapToNotionBlocks,
  writeWikiPageToConnector
} = require('./wikiConnectorWritebackService');

const page = {
  _id: 'wiki-1',
  title: 'Investing',
  status: 'draft',
  body: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Investing' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Investing requires a margin of safety.' }] },
      {
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Evidence should remain cited.' }] }]
        }]
      }
    ]
  }
};

const createLogModel = () => {
  function ConnectorActionLog(payload) {
    Object.assign(this, payload);
  }
  ConnectorActionLog.records = [];
  ConnectorActionLog.prototype.save = async function save() {
    ConnectorActionLog.records.push({ ...this });
    return this;
  };
  return ConnectorActionLog;
};

const createConnectionModel = () => {
  const connection = {
    _id: 'conn-1',
    userId: 'user-1',
    provider: 'notion',
    encryptedAccessToken: 'encrypted-token',
    save: async function save() { return this; }
  };
  return {
    connection,
    findOne: async (query) => (
      String(query?._id) === 'conn-1' && String(query?.userId) === 'user-1' && query?.provider === 'notion'
        ? connection
        : null
    )
  };
};

const run = async () => {
  const blocks = tiptapToNotionBlocks(page.body);
  assert.strictEqual(blocks[0].type, 'heading_1');
  assert.strictEqual(blocks[1].type, 'paragraph');
  assert.strictEqual(blocks[2].type, 'bulleted_list_item');

  const ConnectorActionLog = createLogModel();
  const unsupported = await writeWikiPageToConnector({
    page,
    userId: 'user-1',
    connector: 'readwise',
    models: { ConnectorActionLog }
  }).then(
    () => null,
    error => error
  );
  assert.strictEqual(unsupported.code, 'CONNECTOR_WRITEBACK_UNSUPPORTED');
  assert.strictEqual(ConnectorActionLog.records[0].status, 'skipped');

  const IntegrationConnection = createConnectionModel();
  const result = await writeWikiPageToConnector({
    page,
    userId: 'user-1',
    connector: 'notion',
    connectionId: 'conn-1',
    models: { IntegrationConnection, ConnectorActionLog },
    decryptSecret: (value) => `decrypted:${value}`,
    createNotionPage: async ({ token, title, children }) => {
      assert.strictEqual(token, 'decrypted:encrypted-token');
      assert.strictEqual(title, 'Investing');
      assert.ok(children.length >= 3);
      return { id: 'notion-page-1', url: 'https://notion.so/notion-page-1' };
    }
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.page.id, 'notion-page-1');
  assert.strictEqual(ConnectorActionLog.records.at(-1).status, 'completed');
};

if (require.main === module) {
  run()
    .then(() => console.log('wikiConnectorWritebackService tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
