/**
 * Mongo filter for Connection scope fields.
 * When scope is empty, return {} so item lookups include all scopes (global + workspace-scoped).
 */
/** @param {{ scopeType?: string, scopeId?: string }} [scope] */
const buildConnectionScopeQuery = (scope = {}) => {
  if (!scope?.scopeType && !scope?.scopeId) {
    return {};
  }
  return {
    scopeType: scope.scopeType || '',
    scopeId: scope.scopeId || ''
  };
};

module.exports = {
  buildConnectionScopeQuery
};
