// Text imports save an Article but their connector event is classified as
// external. Recognize that exact provenance, not arbitrary external events.
const isManualTextImport = (event, source) => Boolean(source)
  && event.sourceType === 'external' && event.provider === 'manual'
  && event.title === source.title && event.url === source.url
  && event.metadata?.connector === 'manual' && event.metadata?.source === 'text'
  && event.metadata?.importMode === 'text' && event.metadata?.sourceLabel === 'Pasted text'
  && event.metadata?.reviewerRehearsalHold?.reason === 'reviewer_rehearsal'
  && ((event.metadata?.isNew === true && event.eventType === 'imported')
    || (event.metadata?.isNew === false && event.eventType === 'updated'));

const heldFixtureEvent = (events, { owner, type, objectId, source }) => {
  // Inspect every event for this object so newer held rows cannot hide an
  // attempted, unheld or differently classified event in its history.
  const related = events.filter(event => String(event.sourceObjectId) === objectId);
  if (!related.length || related.some(event => String(event.userId) !== owner
    || event.status !== 'held' || event.attemptCount !== 0
    || event.metadata?.reviewerRehearsalHold?.inferenceAttemptedByHold !== false
    || !(event.sourceType === type || (type === 'article' && isManualTextImport(event, source))))) return null;
  return related[0];
};

module.exports = { heldFixtureEvent };
