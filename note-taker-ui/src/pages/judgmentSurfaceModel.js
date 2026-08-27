import { judgmentHeadline } from './judgmentModel';

const clean = value => String(value || '').trim();
const list = value => (Array.isArray(value) ? value : []);

const pageIdentity = (page = {}, fallback = '') => clean(
  page?._id || page?.id || page?.pageId || fallback
);

const decisionIdentity = decision => clean(decision?.decisionId);
const lessonIdentity = lesson => clean(lesson?.lessonId);

const hasObservedOutcome = decision => Boolean(
  decision?.outcome?.observedAt
  || clean(decision?.outcome?.summary)
  || clean(decision?.outcome?.lesson)
  || clean(decision?.outcome?.receiptId)
);

export const buildJudgmentSurfaceDescriptor = ({ page = null, pageId = '' } = {}) => {
  const safePageId = pageIdentity(page, pageId);
  if (!safePageId) {
    return {
      room: 'judgment',
      objectType: 'judgment_index',
      objectId: 'all',
      title: 'Your judgments',
      projection: 'index',
      mode: 'browse'
    };
  }

  const judgment = page?.judgment || {};
  const decisions = list(judgment.decisions).filter(decisionIdentity);
  const outcomes = decisions.filter(hasObservedOutcome);
  const lessons = list(judgment.lessons).filter(lessonIdentity);
  const last = items => items.length ? items[items.length - 1] : null;
  const latestDecision = last(decisions);
  const latestOutcome = last(outcomes);
  const latestLesson = last(lessons);

  return {
    room: 'judgment',
    objectType: 'judgment_claim',
    objectId: safePageId,
    title: judgmentHeadline(page) || 'Judgment',
    pageId: safePageId,
    claimId: clean(judgment.claimId) || safePageId,
    projection: 'case',
    mode: 'review',
    status: clean(judgment.status) || 'monitoring',
    decisionIds: decisions.map(decisionIdentity),
    outcomeDecisionIds: outcomes.map(decisionIdentity),
    lessonIds: lessons.map(lessonIdentity),
    latestDecisionId: decisionIdentity(latestDecision),
    latestOutcomeDecisionId: decisionIdentity(latestOutcome),
    latestLessonId: lessonIdentity(latestLesson),
    acceptedRevisionId: clean(latestDecision?.acceptedRevisionId),
    recordedRevisionId: clean(latestDecision?.recordedRevisionId),
    evergreen: Boolean(page?.evergreen)
  };
};

export default buildJudgmentSurfaceDescriptor;
