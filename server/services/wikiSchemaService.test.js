const {
  DEFAULT_WIKI_SCHEMA,
  MAX_WIKI_SCHEMA_CHARS,
  formatWikiSchemaPromptBlock,
  normalizeWikiSchemaContent,
  saveWikiSchemaSettings,
  revertWikiSchemaSettings
} = require('./wikiSchemaService');

const clone = (value) => JSON.parse(JSON.stringify(value));

const createFakeWikiSchemaSettings = () => {
  const records = [];

  function WikiSchemaSettings(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || `schema-${records.length + 1}`;
    this.snapshots = Array.isArray(this.snapshots) ? this.snapshots.map((snapshot, index) => ({
      ...snapshot,
      _id: snapshot._id || `snap-${Date.now()}-${index}`
    })) : [];
  }

  WikiSchemaSettings.records = records;
  WikiSchemaSettings.findOne = async (query = {}) => {
    const found = records.find(record => String(record.userId) === String(query.userId));
    return found ? new WikiSchemaSettings(clone(found)) : null;
  };
  WikiSchemaSettings.prototype.toObject = function toObject() {
    return clone(this);
  };
  WikiSchemaSettings.prototype.save = async function save() {
    this.snapshots = (this.snapshots || []).map((snapshot, index) => ({
      ...snapshot,
      _id: snapshot._id || `snap-save-${Date.now()}-${index}`
    }));
    const stored = this.toObject();
    const index = records.findIndex(record => String(record.userId) === String(this.userId));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };
  return WikiSchemaSettings;
};

describe('wikiSchemaService', () => {
  it('normalizes schema content to the 8000 character prompt budget', () => {
    expect(normalizeWikiSchemaContent(` ${'x'.repeat(MAX_WIKI_SCHEMA_CHARS + 10)} `)).toHaveLength(MAX_WIKI_SCHEMA_CHARS);
  });

  it('formats default schema content for prompt injection', () => {
    const block = formatWikiSchemaPromptBlock('');
    expect(block).toContain('User wiki schema conventions');
    expect(block).toContain(DEFAULT_WIKI_SCHEMA.slice(0, 40));
  });

  it('creates save snapshots and can revert to an earlier snapshot', async () => {
    const WikiSchemaSettings = createFakeWikiSchemaSettings();
    const first = await saveWikiSchemaSettings({
      WikiSchemaSettings,
      userId: 'user-1',
      content: '# First schema'
    });
    const second = await saveWikiSchemaSettings({
      WikiSchemaSettings,
      userId: 'user-1',
      content: '# Second schema'
    });

    expect(second.content).toBe('# Second schema');
    expect(second.snapshots.length).toBe(2);

    const firstSnapshotId = first.snapshots[0].id;
    const reverted = await revertWikiSchemaSettings({
      WikiSchemaSettings,
      userId: 'user-1',
      snapshotId: firstSnapshotId
    });
    expect(reverted.content).toBe('# First schema');
    expect(reverted.snapshots.length).toBe(3);
  });
});
