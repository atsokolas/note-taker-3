const {
  ACTIONS,
  KIND,
  attachAuthoredSourceCorrection,
  correctionIdentity,
  disposeAuthoredSourceCorrection,
  recordSourceCorrection,
  recordedUsesFromExploration,
  recordedUsesFromNotebook,
  receiptKey,
  selectAuthoredSourceCorrection
} = require('./authoredSourceCorrection');
const { persistNoeisReceipt } = require('./noeisReceiptService');
const { selectPaperConsequence } = require('./consequenceRoute');

const USER = '64f200000000000000000001';
const HIGHLIGHT = '64f2000000000000000000aa';
const ARTICLE = '64f2000000000000000000bb';
const NOTE = '64f2000000000000000000cc';
const EVENT = '64f2000000000000000000dd';
const OLD = 'Two hours a week can sustain this.';
const NEW = 'Two hours a week cannot sustain this.';
const NOW = new Date('2026-09-12T12:00:00.000Z');

const matchQuery = (query = {}, row = {}) => Object.entries(query).every(([key, expected]) => {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && expected.$in) {
    const value = key.includes('.')
      ? key.split('.').reduce((cursor, part) => cursor?.[part], row)
      : row[key];
    return expected.$in.map(String).includes(String(value));
  }
  if (key.includes('.')) {
    return String(key.split('.').reduce((cursor, part) => cursor?.[part], row) || '') === String(expected);
  }
  return String(row[key] || '') === String(expected);
});

const memoryEvents = (initial = []) => {
  const store = [...initial];
  const WikiSourceEvent = function WikiSourceEvent(value) {
    Object.assign(this, value);
    this._id = this._id || `evt-${store.length + 1}`;
    this.save = async () => {
      const index = store.findIndex((row) => String(row._id) === String(this._id));
      if (index >= 0) store[index] = this;
      else store.push(this);
      return this;
    };
  };
  WikiSourceEvent.findOne = (query) => {
    const api = {
      sort() { return api; },
      lean: async () => store.find((row) => matchQuery(query, row)) || null
    };
    api.then = (resolve, reject) => Promise.resolve(store.find((row) => matchQuery(query, row)) || null).then(resolve, reject);
    return api;
  };
  WikiSourceEvent.find = (query) => {
    let rows = store.filter((row) => matchQuery(query, row));
    const api = {
      sort(spec = {}) {
        const key = Object.keys(spec)[0];
        const dir = spec[key] || 1;
        rows = [...rows].sort((left, right) => dir * (new Date(left[key] || 0) - new Date(right[key] || 0)));
        return api;
      },
      lean: async () => rows
    };
    api.then = (resolve, reject) => Promise.resolve(rows).then(resolve, reject);
    return api;
  };
  WikiSourceEvent._store = store;
  return WikiSourceEvent;
};

const memoryReceipts = () => {
  const receipts = new Map();
  return {
    findOne: async ({ receiptId }) => receipts.get(receiptId) || null,
    findOneAndUpdate: async (_query, { $set }) => {
      const stored = { ...$set };
      receipts.set(stored.receiptId, stored);
      return stored;
    },
    _receipts: receipts
  };
};

const correctionEvent = (overrides = {}) => ({
  _id: EVENT,
  userId: USER,
  sourceType: 'highlight',
  sourceObjectId: HIGHLIGHT,
  parentObjectId: ARTICLE,
  provider: 'library',
  eventType: 'updated',
  title: 'A letter on time',
  text: NEW,
  url: 'https://example.com/letter',
  sourceUpdatedAt: new Date('2026-09-11T15:00:00.000Z'),
  createdAt: new Date('2026-09-11T15:01:00.000Z'),
  status: 'processed',
  metadata: {
    kind: 'source_correction',
    previousText: OLD,
    correctionIdentity: 'identity-1',
    correctsEventId: 'evt-original'
  },
  ...overrides
});

const notebook = (overrides = {}) => ({
  _id: NOTE,
  userId: USER,
  title: 'Who gets to experiment',
  blocks: [{
    id: 'block-quote',
    type: 'highlight_embed',
    highlightId: HIGHLIGHT,
    articleId: ARTICLE,
    articleTitle: 'A letter on time',
    text: OLD
  }, {
    id: 'block-prose',
    type: 'paragraph',
    text: 'The work still depends on two hours.'
  }],
  markModified() {},
  async save() { return this; },
  toObject() { return { ...this, save: undefined, markModified: undefined, toObject: undefined }; },
  ...overrides
});

describe('recorded uses', () => {
  it('reads exact notebook highlight identity, not similar wording', () => {
    const uses = recordedUsesFromNotebook(notebook());
    expect(uses).toEqual([expect.objectContaining({
      highlightId: HIGHLIGHT,
      articleId: ARTICLE,
      quotation: OLD
    })]);
    expect(recordedUsesFromNotebook({
      blocks: [{ type: 'paragraph', text: OLD }]
    })).toEqual([]);
  });

  it('reads the selected source on an exploration', () => {
    const uses = recordedUsesFromExploration({
      id: 'exp-1',
      draft: {
        selectedSource: {
          articleId: ARTICLE,
          highlightId: HIGHLIGHT,
          passage: OLD,
          articleTitle: 'A letter on time'
        }
      }
    });
    expect(uses[0]).toEqual(expect.objectContaining({
      highlightId: HIGHLIGHT,
      quotation: OLD
    }));
  });
});

describe('recordSourceCorrection', () => {
  it('stores old quotation and new evidence with real source identity', async () => {
    const WikiSourceEvent = memoryEvents();
    const result = await recordSourceCorrection({
      WikiSourceEvent,
      userId: USER,
      sourceType: 'highlight',
      sourceObjectId: HIGHLIGHT,
      parentObjectId: ARTICLE,
      title: 'A letter on time',
      previousText: OLD,
      text: NEW,
      sourceUpdatedAt: NOW
    });
    expect(result.reason).toBe('recorded');
    expect(result.event.status).toBe('processed');
    expect(result.event.metadata.kind).toBe('source_correction');
    expect(result.event.metadata.previousText).toBe(OLD);
    expect(result.event.text).toBe(NEW);
    expect(result.event.sourceObjectId).toBe(HIGHLIGHT);
    expect(result.event.metadata.correctionIdentity).toBe(correctionIdentity({
      userId: USER,
      sourceType: 'highlight',
      sourceObjectId: HIGHLIGHT,
      previousText: OLD,
      text: NEW
    }));
  });

  it('suppresses a duplicate correction instead of minting a second event', async () => {
    const WikiSourceEvent = memoryEvents();
    const first = await recordSourceCorrection({
      WikiSourceEvent,
      userId: USER,
      sourceType: 'highlight',
      sourceObjectId: HIGHLIGHT,
      previousText: OLD,
      text: NEW
    });
    const second = await recordSourceCorrection({
      WikiSourceEvent,
      userId: USER,
      sourceType: 'highlight',
      sourceObjectId: HIGHLIGHT,
      previousText: OLD,
      text: NEW
    });
    expect(second.duplicate).toBe(true);
    expect(idOf(second.event)).toBe(idOf(first.event));
    expect(WikiSourceEvent._store).toHaveLength(1);
  });

  it('does not record unchanged text', async () => {
    const WikiSourceEvent = memoryEvents();
    const result = await recordSourceCorrection({
      WikiSourceEvent,
      userId: USER,
      sourceType: 'highlight',
      sourceObjectId: HIGHLIGHT,
      previousText: OLD,
      text: OLD
    });
    expect(result.reason).toBe('no_impact');
    expect(WikiSourceEvent._store).toHaveLength(0);
  });
});

const idOf = (value) => String(value?._id || value?.id || value || '');

describe('selectAuthoredSourceCorrection', () => {
  const modelsFor = (event, receipts = memoryReceipts()) => ({
    WikiSourceEvent: memoryEvents([event]),
    NoeisReceipt: receipts
  });

  it('surfaces one affected notebook with old quotation and new evidence', async () => {
    const preview = await selectAuthoredSourceCorrection({
      models: modelsFor(correctionEvent()),
      userId: USER,
      objectType: 'notebook',
      object: notebook(),
      now: NOW
    });
    expect(preview.ui).toBe('review');
    expect(preview.eventId).toBe(EVENT);
    expect(preview.sourceUseId).toBe('block-quote');
    expect(preview.oldQuotation).toBe(OLD);
    expect(preview.newEvidence).toBe(NEW);
    expect(preview.changedSegments.some((part) => part.kind === 'removed' && part.text.includes('can'))).toBe(true);
    expect(preview.changedSegments.some((part) => part.kind === 'added' && part.text.includes('cannot'))).toBe(true);
    expect(preview.sourceUpdatedOn).toBe('2026-09-11');
  });

  it('stays silent without a recorded use', async () => {
    const preview = await selectAuthoredSourceCorrection({
      models: modelsFor(correctionEvent()),
      userId: USER,
      objectType: 'notebook',
      object: notebook({ blocks: [{ id: 'p1', type: 'paragraph', text: 'Unrelated.' }] }),
      now: NOW
    });
    expect(preview).toBeNull();
  });

  it('stays silent for another account', async () => {
    const preview = await selectAuthoredSourceCorrection({
      models: modelsFor(correctionEvent()),
      userId: '64f200000000000000000099',
      objectType: 'notebook',
      object: notebook({ userId: '64f200000000000000000099' }),
      now: NOW
    });
    expect(preview).toBeNull();
  });

  it('does not attach filler when nothing qualifies', async () => {
    const payload = await attachAuthoredSourceCorrection({
      models: { WikiSourceEvent: memoryEvents(), NoeisReceipt: memoryReceipts() },
      userId: USER,
      objectType: 'notebook',
      object: notebook()
    });
    expect(payload.sourceCorrection).toBeUndefined();
  });
});

describe('disposeAuthoredSourceCorrection', () => {
  const setup = () => {
    const event = correctionEvent();
    const receipts = memoryReceipts();
    const held = notebook();
    return {
      held,
      models: {
        WikiSourceEvent: memoryEvents([event]),
        NoeisReceipt: receipts
      }
    };
  };

  it('records an explicit no-change receipt without rewriting the work', async () => {
    const { held, models } = setup();
    const result = await disposeAuthoredSourceCorrection({
      models,
      userId: USER,
      objectType: 'notebook',
      object: held,
      eventId: EVENT,
      action: 'no_change',
      now: NOW
    });
    expect(result.receipt.kind).toBe(KIND);
    expect(result.receipt.status).toBe('completed');
    expect(result.receipt.provenance.disposition).toBe('no_change');
    expect(result.receipt.provenance.writingRewritten).toBe(false);
    expect(result.receipt.provenance.oldQuotation).toBe(OLD);
    expect(result.receipt.provenance.newEvidence).toBe(NEW);
    expect(held.blocks[0].text).toBe(OLD);
    expect(held.blocks[1].text).toBe('The work still depends on two hours.');
    expect(result.preview.ui).toBe('settled');
  });

  it('keep leaves the old quotation in the work', async () => {
    const { held, models } = setup();
    const result = await disposeAuthoredSourceCorrection({
      models,
      userId: USER,
      objectType: 'notebook',
      object: held,
      eventId: EVENT,
      action: 'keep',
      now: NOW
    });
    expect(result.receipt.provenance.disposition).toBe('keep');
    expect(held.blocks[0].text).toBe(OLD);
    expect(held.blocks[1].text).toBe('The work still depends on two hours.');
  });

  it('change on an exploration updates the citation only and leaves the writing', async () => {
    const event = correctionEvent();
    const receipts = memoryReceipts();
    const held = {
      _id: 'exp-1',
      userId: USER,
      pageId: '64f2000000000000000000ee',
      revision: 2,
      draft: {
        title: 'Who gets to experiment',
        writing: 'The work still depends on two hours.',
        selectedSource: {
          articleId: ARTICLE,
          highlightId: HIGHLIGHT,
          passage: OLD,
          articleTitle: 'A letter on time'
        }
      },
      markModified() {},
      async save() { return this; },
      toObject() { return { ...this, save: undefined, markModified: undefined, toObject: undefined }; }
    };
    const result = await disposeAuthoredSourceCorrection({
      models: {
        WikiSourceEvent: memoryEvents([event]),
        NoeisReceipt: receipts
      },
      userId: USER,
      objectType: 'exploration',
      object: held,
      eventId: EVENT,
      action: 'change',
      now: NOW
    });
    expect(result.receipt.provenance.disposition).toBe('change');
    expect(result.receipt.provenance.writingRewritten).toBe(false);
    expect(result.receipt.provenance.pageId).toBe('64f2000000000000000000ee');
    expect(held.draft.writing).toBe('The work still depends on two hours.');
    expect(held.draft.selectedSource.passage).toBe(NEW);
    expect(held.revision).toBe(3);
  });

  it('change updates the recorded quotation only, never the authored prose', async () => {
    const { held, models } = setup();
    const result = await disposeAuthoredSourceCorrection({
      models,
      userId: USER,
      objectType: 'notebook',
      object: held,
      eventId: EVENT,
      action: 'change',
      now: NOW
    });
    expect(result.receipt.provenance.disposition).toBe('change');
    expect(result.receipt.provenance.writingRewritten).toBe(false);
    expect(held.blocks[0].text).toBe(NEW);
    expect(held.blocks[1].text).toBe('The work still depends on two hours.');
    expect(result.preview.oldQuotation).toBe(OLD);
    expect(result.preview.newEvidence).toBe(NEW);
  });

  it('replays a terminal no-change instead of writing a second receipt', async () => {
    const { held, models } = setup();
    const first = await disposeAuthoredSourceCorrection({
      models,
      userId: USER,
      objectType: 'notebook',
      object: held,
      eventId: EVENT,
      action: 'no_change',
      now: NOW
    });
    const second = await disposeAuthoredSourceCorrection({
      models,
      userId: USER,
      objectType: 'notebook',
      object: held,
      eventId: EVENT,
      action: 'change',
      now: NOW
    });
    expect(second.replay).toBe(true);
    expect(second.receipt.id).toBe(first.receipt.id);
    expect(second.receipt.provenance.disposition).toBe('no_change');
    expect(held.blocks[0].text).toBe(OLD);
  });

  it('refuses an unknown verb', async () => {
    const { held, models } = setup();
    await expect(disposeAuthoredSourceCorrection({
      models,
      userId: USER,
      objectType: 'notebook',
      object: held,
      eventId: EVENT,
      action: 'accept'
    })).rejects.toMatchObject({ code: 'invalid_disposition' });
    expect(ACTIONS).toEqual(['keep', 'change', 'no_change']);
  });
});

describe('wiki paper does not auto-rewrite from a library correction', () => {
  it('does not select a library source correction as a morning consequence', () => {
    const paper = selectPaperConsequence({
      events: [correctionEvent({
        provider: 'library',
        externalId: HIGHLIGHT,
        affectedPageIds: ['page-1']
      })],
      pages: [{
        _id: 'page-1',
        claims: [{ claimId: 'claim-1', text: OLD, lastCheckedAt: new Date('2026-08-01') }],
        judgment: { currentJudgment: OLD }
      }],
      now: NOW
    });
    expect(paper).toBeNull();
  });
});

describe('receipt key', () => {
  it('is exact to owner, event, and authored object', () => {
    expect(receiptKey({
      userId: USER,
      eventId: EVENT,
      objectType: 'notebook',
      objectId: NOTE
    })).toBe(`authored_source_correction:v1:${USER}:${EVENT}:notebook:${NOTE}`);
  });
});

describe('persistNoeisReceipt is the consequence store', () => {
  it('round-trips an authored correction receipt', async () => {
    const NoeisReceipt = memoryReceipts();
    const stored = await persistNoeisReceipt({
      NoeisReceipt,
      userId: USER,
      receipt: {
        id: receiptKey({ userId: USER, eventId: EVENT, objectType: 'notebook', objectId: NOTE }),
        kind: KIND,
        source: 'notebook',
        status: 'completed',
        title: 'A letter on time',
        summary: 'No change.',
        provenance: { eventId: EVENT, disposition: 'no_change' },
        completedAt: NOW
      }
    });
    expect(stored.kind).toBe(KIND);
    expect(stored.provenance.eventId).toBe(EVENT);
  });
});
