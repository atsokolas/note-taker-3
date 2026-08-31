const clean = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = value => Array.isArray(value) ? value : [];
const activeClaim = (claim = {}) => claim.checkInStatus !== 'retired' && !claim.retiredAt;
const claimMap = claims => new Map(list(claims)
  .filter(claim => claim?.claimId)
  .map(claim => [String(claim.claimId), claim]));

const diffRevisionClaims = (revision = {}) => {
  const before = claimMap(revision.before?.claims);
  const after = claimMap(revision.after?.claims);
  const changed = [];
  for (const [claimId, next] of after.entries()) {
    const previous = before.get(claimId);
    if (!activeClaim(next)) continue;
    const beforeSupport = String(previous?.support || 'untracked');
    const afterSupport = String(next?.support || 'unsupported');
    const textChanged = previous && clean(previous.text) !== clean(next.text);
    const evidenceChanged = JSON.stringify(list(previous?.sourceRefIds).map(String).sort())
      !== JSON.stringify(list(next?.sourceRefIds).map(String).sort());
    if (!previous || beforeSupport !== afterSupport || textChanged || evidenceChanged) {
      changed.push({
        claimId,
        beforeSupport,
        afterSupport,
        textChanged: Boolean(textChanged),
        evidenceChanged,
        claimText: clean(next.text, 260)
      });
    }
  }
  return changed;
};

const claimImpactSummary = (claimImpacts = []) => {
  if (!claimImpacts.length) return 'not yet analyzed — queued';
  const supported = claimImpacts.filter(row => row.afterSupport === 'supported' && row.beforeSupport !== 'supported').length;
  const contradicted = claimImpacts.filter(row => row.afterSupport === 'conflicted' && row.beforeSupport !== 'conflicted').length;
  return [
    `${claimImpacts.length} claim${claimImpacts.length === 1 ? '' : 's'} touched`,
    supported ? `${supported} gained support` : '',
    contradicted ? `${contradicted} contradicted` : ''
  ].filter(Boolean).join(' · ');
};

const impactRegister = impacts => {
  if (!list(impacts).length) return 'neutral';
  if (impacts.some(row => clean(row?.afterSupport) === 'conflicted')) return 'cuts_against';
  if (impacts.some(row => clean(row?.afterSupport) === 'supported')) return 'supports';
  return 'neutral';
};

module.exports = {
  activeClaim,
  claimImpactSummary,
  diffRevisionClaims,
  impactRegister
};
