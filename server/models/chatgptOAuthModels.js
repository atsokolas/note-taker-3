const mongoose = require('mongoose');

// OAuth state is durable across workers/restarts. Only hashes of credentials are stored.
const requestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  redirectUri: { type: String, required: true },
  resource: { type: String, required: true },
  scopes: { type: [String], required: true },
  state: { type: String, default: '' },
  challenge: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  codeHash: { type: String, default: null, index: true },
  status: { type: String, enum: ['pending', 'approved', 'denied', 'consumed'], default: 'pending' },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
requestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const grantSchema = new mongoose.Schema({
  familyId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId: { type: String, required: true },
  resource: { type: String, required: true },
  scopes: { type: [String], required: true },
  refreshHash: { type: String, required: true, unique: true },
  usedRefreshHashes: { type: [String], default: [], index: true },
  refreshCount: { type: Number, default: 0, min: 0 },
  accessTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentToken', default: null },
  revokedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
// Retain expired grants briefly so refresh replay still fails closed.
grantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
// A bounded number of fixed rate/admission documents is shared by all workers.
// Atomic pipeline updates enforce limits; TTL is cleanup, never authorization.
const controlSchema = new mongoose.Schema({
  _id: { type: String },
  kind: { type: String, enum: ['rate', 'admission'], required: true },
  count: { type: Number, default: 0, min: 0 },
  windowStartedAt: { type: Date, default: new Date(0) },
  leases: { type: [{ _id: false, id: String, expiresAt: Date }], default: [] },
  expiresAt: { type: Date, required: true }
}, { versionKey: false });
controlSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = {
  ChatgptOAuthControl: mongoose.models.ChatgptOAuthControl || mongoose.model('ChatgptOAuthControl', controlSchema),
  ChatgptOAuthRequest: mongoose.models.ChatgptOAuthRequest || mongoose.model('ChatgptOAuthRequest', requestSchema),
  ChatgptOAuthGrant: mongoose.models.ChatgptOAuthGrant || mongoose.model('ChatgptOAuthGrant', grantSchema)
};
