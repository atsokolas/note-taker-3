const crypto = require('crypto');

const DEFAULT_SECRET = 'note-taker-integration-secret';

const getSecretMaterial = () => (
  String(
    process.env.INTEGRATION_SECRET
    || process.env.JWT_SECRET
    || DEFAULT_SECRET
  ).trim()
);

const getKey = () => (
  crypto.createHash('sha256').update(getSecretMaterial()).digest()
);

const encryptSecret = (value = '') => {
  const plaintext = String(value || '');
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join('.');
};

const decryptSecret = (payload = '') => {
  const serialized = String(payload || '').trim();
  if (!serialized) return '';
  const [ivPart, tagPart, dataPart] = serialized.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Encrypted secret payload is malformed.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(ivPart, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
};

module.exports = {
  encryptSecret,
  decryptSecret
};
