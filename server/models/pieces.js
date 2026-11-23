// Sub-documents more than one room keeps: an agent's pencil mark and where an import came from.
const mongoose = require('mongoose');

const importMetaSchema = new mongoose.Schema({
  provider: { type: String, default: '', trim: true },
  sourceType: { type: String, default: '', trim: true },
  sourceLabel: { type: String, default: '', trim: true },
  sourcePath: { type: String, default: '', trim: true },
  sourceUrl: { type: String, default: '', trim: true },
  folderOwnership: { type: String, default: '', trim: true },
  draftTemplate: { type: String, default: '', trim: true },
  draftTemplateLabel: { type: String, default: '', trim: true },
  externalId: { type: String, default: '', trim: true },
  parentExternalId: { type: String, default: '', trim: true },
  // Tags the source carried where it came from (Pocket, Instapaper), kept as written.
  tags: { type: [String], default: undefined },
  importSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportSession', default: null },
  importedAt: { type: Date, default: null },
  searchableAt: { type: Date, default: null },
  // Provider-side "last modified" timestamp used for skip-if-unchanged logic
  // (PR #20 Notion agent fetch). Stored as a string because Notion returns
  // an ISO 8601 string and we compare via string equality — coercing to
  // Date and back loses millisecond fidelity in some clients.
  lastNotionEditedAt: { type: String, default: '', trim: true }
}, { _id: false });

// Article Schema and Model - MODIFIED TO INCLUDE userId
/* Written by an agent and not yet taken up by the reader: which connection
   wrote it, and when. Ink is the absence of pencil. */
const pencilSchema = new mongoose.Schema({
  agent: { type: String, default: '' },
  tokenId: { type: mongoose.Schema.Types.ObjectId, default: null },
  at: { type: Date, default: Date.now }
}, { _id: false });

module.exports = {
  importMetaSchema,
  pencilSchema
};
