const asString = (value = '') => String(value || '').trim();

const toArray = (value) => (Array.isArray(value) ? value : []);

const LIMITS = {
  answerableQuestions: 2,
  pagesWithNewSourceMaterial: 3,
  recentMaintenanceChanges: 2
};

export const isSafeBriefingHref = (href = '') => {
  const value = asString(href);
  return (
    value.startsWith('/')
    && !value.startsWith('//')
    && !/^\/(?:https?:)?\//i.test(value)
  );
};

export const normalizeBriefingNextAction = (briefing) => {
  const action = briefing?.nextAction;
  if (!action || typeof action !== 'object') return null;
  const label = asString(action.label);
  const href = asString(action.href);
  if (!label || !isSafeBriefingHref(href)) return null;
  const reason = asString(action.reason);
  return {
    type: asString(action.type) || null,
    label,
    href,
    reason: reason || null
  };
};

export const selectBriefingReturnLoopNotes = (briefing, limits = LIMITS) => {
  const answerableQuestions = toArray(briefing?.answerableQuestions).slice(0, limits.answerableQuestions);
  const pagesWithNewSourceMaterial = toArray(briefing?.pagesWithNewSourceMaterial)
    .slice(0, limits.pagesWithNewSourceMaterial);
  const sourcePageIds = new Set(
    pagesWithNewSourceMaterial.map((page) => asString(page.pageId)).filter(Boolean)
  );
  const recentMaintenanceChanges = toArray(briefing?.recentMaintenanceChanges)
    .filter((change) => !sourcePageIds.has(asString(change.pageId)))
    .slice(0, limits.recentMaintenanceChanges);

  return {
    answerableQuestions,
    pagesWithNewSourceMaterial,
    recentMaintenanceChanges
  };
};

export const hasBriefingReturnLoopNotes = (notes = {}) => (
  toArray(notes.answerableQuestions).length > 0
  || toArray(notes.pagesWithNewSourceMaterial).length > 0
  || toArray(notes.recentMaintenanceChanges).length > 0
);

export const sourcePageHref = (page = {}) => {
  const pageId = asString(page.pageId);
  return pageId ? `/wiki/workspace?page=${pageId}` : '';
};

export const formatSourcePageNote = (page = {}) => {
  const count = Number(page.addedSourceCount || 0);
  const sourceLabel = count === 1 ? '1 new source' : `${count} new sources`;
  const titles = toArray(page.sourceTitles).filter(Boolean).slice(0, 2);
  const detail = titles.length ? ` — ${titles.join(', ')}` : '';
  return `${sourceLabel}${detail}`;
};

export const formatAnswerableQuestionNote = (question = {}) => {
  const evidenceCount = Number(question.evidenceCount || 0);
  const pageTitle = asString(question.evidencePageTitle);
  if (pageTitle && evidenceCount > 0) {
    const sourceLabel = evidenceCount === 1 ? '1 source' : `${evidenceCount} sources`;
    return `Fresh evidence via ${pageTitle} (${sourceLabel})`;
  }
  if (pageTitle) return `Fresh evidence via ${pageTitle}`;
  return 'Fresh evidence attached';
};

export const formatMaintenanceChangeNote = (change = {}) => {
  const summary = asString(change.summary);
  if (summary) return summary;
  const added = Number(change.sourceRefsAdded || 0);
  if (added > 0) {
    return added === 1 ? '1 source attached overnight' : `${added} sources attached overnight`;
  }
  const supportChanged = Number(change.supportChanged || 0);
  if (supportChanged > 0) {
    return supportChanged === 1
      ? '1 claim gained support'
      : `${supportChanged} claims gained support`;
  }
  const claimsChanged = Number(change.claimsChanged || 0);
  if (claimsChanged > 0) {
    return claimsChanged === 1
      ? '1 claim updated overnight'
      : `${claimsChanged} claims updated overnight`;
  }
  return 'Updated overnight';
};

export const selectPrimaryReturnLoopNote = (notes = {}) => {
  const question = toArray(notes.answerableQuestions)[0];
  if (question) {
    return {
      type: 'question',
      label: question.text || 'Open question',
      href: isSafeBriefingHref(question.href) ? question.href : '/think?tab=questions',
      detail: formatAnswerableQuestionNote(question)
    };
  }
  const sourcedPage = toArray(notes.pagesWithNewSourceMaterial)[0];
  if (sourcedPage) {
    return {
      type: 'source_material',
      label: sourcedPage.title || 'Untitled page',
      href: sourcePageHref(sourcedPage) || '/wiki/workspace?view=list',
      detail: formatSourcePageNote(sourcedPage)
    };
  }
  const change = toArray(notes.recentMaintenanceChanges)[0];
  if (change) {
    return {
      type: 'maintenance',
      label: change.title || 'Untitled page',
      href: sourcePageHref(change) || '/wiki/workspace?view=list',
      detail: formatMaintenanceChangeNote(change)
    };
  }
  return null;
};
