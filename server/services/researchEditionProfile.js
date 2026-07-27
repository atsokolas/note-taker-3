const PROFILES = Object.freeze({
  weekend_readings: Object.freeze({
    key: 'weekend_readings',
    editionPrefix: 'weekend-readings',
    artifactType: 'weekend_readings',
    titleLabel: 'Weekend Readings',
    issueLabel: 'Edition',
    sourceLabel: 'Weekend Readings',
    minItems: 1,
    maxItems: 15
  }),
  this_week_in_ai: Object.freeze({
    key: 'this_week_in_ai',
    editionPrefix: 'this-week-in-ai',
    artifactType: 'this_week_in_ai',
    titleLabel: 'This Week in AI',
    issueLabel: 'Issue',
    sourceLabel: 'This Week in AI',
    minItems: 2,
    maxItems: 5
  })
});

const clean = value => String(value || '').trim().toLowerCase();

const resolveResearchEditionProfile = (value = 'weekend_readings') => {
  const key = clean(value).replace(/-/g, '_') || 'weekend_readings';
  const profile = PROFILES[key];
  if (!profile) throw new Error(`Unknown research edition profile "${value}".`);
  return profile;
};

const profileFromEditionKey = (editionKey = '') => {
  const prefix = clean(editionKey).split(':')[0];
  const profile = Object.values(PROFILES).find(candidate => candidate.editionPrefix === prefix);
  if (!profile) throw new Error('Research edition key is invalid.');
  return profile;
};

const isResearchEditionKey = (editionKey = '') => {
  try {
    profileFromEditionKey(editionKey);
    return true;
  } catch (_error) {
    return false;
  }
};

const isResearchEditionPage = (page = {}) => isResearchEditionKey(page?.createdFrom?.label);

module.exports = {
  PROFILES,
  isResearchEditionKey,
  isResearchEditionPage,
  profileFromEditionKey,
  resolveResearchEditionProfile
};
