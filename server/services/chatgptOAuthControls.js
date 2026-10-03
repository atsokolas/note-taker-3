const crypto = require('crypto');
const hashKey = value => crypto.createHash('sha256').update(value).digest('hex');
const WINDOW_MS = 60000;
const REQUEST_TTL_MS = 10 * 60000;

// Fixed global/configured-client keys prevent random IPs, tokens, codes, or
// callback state from growing a separate limiter collection without bound.
const buildChatgptOAuthControls = ({ Control, config, now = () => new Date() }) => {
  const limits = config.limits;
  const ensure = async (key, kind) => {
    try {
      await Control.updateOne({ _id: key }, { $setOnInsert: {
        kind, count: 0, windowStartedAt: new Date(0), leases: [], expiresAt: new Date(now().getTime() + REQUEST_TTL_MS + WINDOW_MS * 2)
      } }, { upsert: true });
    } catch (error) { if (error.code !== 11000) throw error; }
  };
  const consumeKey = async (key, limit) => {
    const current = now();
    const start = new Date(Math.floor(current.getTime() / WINDOW_MS) * WINDOW_MS);
    await ensure(key, 'rate');
    const accepted = await Control.findOneAndUpdate({ _id: key, $or: [
      { windowStartedAt: { $lt: start } }, { count: { $lt: limit }, windowStartedAt: start }
    ] }, [{ $set: {
      count: { $cond: [{ $eq: ['$windowStartedAt', start] }, { $add: ['$count', 1] }, 1] },
      windowStartedAt: start, expiresAt: new Date(start.getTime() + WINDOW_MS * 3)
    } }], { new: true });
    return Boolean(accepted);
  };
  const rate = async (endpoint, clientId) => {
    const budget = limits[endpoint];
    if (!budget) throw new Error('Unknown OAuth control endpoint.');
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - now().getTime() % WINDOW_MS) / 1000));
    if (!await consumeKey(`rate:${endpoint}:global`, budget.global)) return { allowed: false, retryAfter };
    // Unknown clients spend the fixed global budget, never get a new key.
    if (clientId && config.clients.has(clientId) && !await consumeKey(`rate:${endpoint}:client:${hashKey(clientId)}`, budget.client)) {
      return { allowed: false, retryAfter };
    }
    return { allowed: true, retryAfter };
  };
  const leaseKey = async (key, limit, id, expiresAt) => {
    const current = now();
    await ensure(key, 'admission');
    const active = { $filter: { input: '$leases', as: 'lease', cond: { $gt: ['$$lease.expiresAt', current] } } };
    const accepted = await Control.findOneAndUpdate({ _id: key, $expr: { $lt: [{ $size: active }, limit] } }, [{ $set: {
      leases: { $concatArrays: [active, [{ id, expiresAt }]] },
      expiresAt: new Date(expiresAt.getTime() + WINDOW_MS * 2)
    } }], { new: true });
    return Boolean(accepted);
  };
  const release = async ({ id, clientId }) => {
    await Promise.all([
      Control.updateOne({ _id: 'admission:global' }, { $pull: { leases: { id } } }),
      Control.updateOne({ _id: `admission:client:${hashKey(clientId)}` }, { $pull: { leases: { id } } })
    ]);
  };
  const admit = async clientId => {
    if (!config.clients.has(clientId)) throw new Error('Configured client required for OAuth admission.');
    const id = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(now().getTime() + REQUEST_TTL_MS);
    const lease = { id, clientId, expiresAt };
    if (!await leaseKey('admission:global', limits.pending.global, id, expiresAt)) return null;
    try {
      if (await leaseKey(`admission:client:${hashKey(clientId)}`, limits.pending.client, id, expiresAt)) return lease;
    } catch (error) { await release(lease); throw error; }
    await release(lease);
    return null;
  };
  return { rate, admit, release };
};
module.exports = { buildChatgptOAuthControls, REQUEST_TTL_MS };
