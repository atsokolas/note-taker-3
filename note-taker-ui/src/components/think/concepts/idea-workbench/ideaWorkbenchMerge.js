const clean = (value) => String(value || '').trim();

const stripHtml = (value = '') => clean(
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
);

export const cardIdentity = (card = {}) => clean(
  card.sourceKey
  || card.id
  || `${card.type}|${card.sourcePath}|${card.title}|${stripHtml(card.content)}`
);

export const genericIdentity = (item = {}, type = 'item') => clean(
  item.id
  || `${type}|${item.title}|${item.label}|${stripHtml(item.text || item.body || item.html || '')}`
);

export const sortByCreatedAt = (items = []) => [...items].sort((left, right) => {
  const leftTs = new Date(left?.createdAt || 0).getTime();
  const rightTs = new Date(right?.createdAt || 0).getTime();
  if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) return leftTs - rightTs;
  return clean(left?.id).localeCompare(clean(right?.id));
});

export const mergeCards = (localCards = [], remoteCards = []) => {
  const merged = new Map();
  remoteCards.forEach((card) => {
    const identity = cardIdentity(card);
    if (!identity) return;
    merged.set(identity, card);
  });
  localCards.forEach((card) => {
    const identity = cardIdentity(card);
    if (!identity) return;
    const existing = merged.get(identity);
    if (!existing) {
      merged.set(identity, card);
      return;
    }
    merged.set(identity, {
      ...existing,
      ...card,
      sourceKey: card.sourceKey || existing.sourceKey,
      sourcePath: card.sourcePath || existing.sourcePath,
      tags: [...new Set([...(existing.tags || []), ...(card.tags || [])])]
    });
  });
  return sortByCreatedAt(Array.from(merged.values()));
};

export const mergeGenericTimeline = (localItems = [], remoteItems = [], kind = 'item') => {
  const merged = new Map();
  remoteItems.forEach((item) => {
    const identity = genericIdentity(item, kind);
    if (!identity) return;
    merged.set(identity, item);
  });
  localItems.forEach((item) => {
    const identity = genericIdentity(item, kind);
    if (!identity) return;
    if (!merged.has(identity)) {
      merged.set(identity, item);
      return;
    }
    merged.set(identity, { ...merged.get(identity), ...item });
  });
  return sortByCreatedAt(Array.from(merged.values()));
};

export const mergeWorkbenchStates = (localState, remoteState, choices = {}) => {
  const headerChoice = clean(choices.header) || 'local';
  const cardsChoice = clean(choices.cards) || 'merge';
  const hypothesisChoice = clean(choices.hypothesis) || 'local';
  const agentChoice = clean(choices.agent) || 'merge';

  const mergedCards = cardsChoice === 'remote'
    ? remoteState.cards
    : cardsChoice === 'local'
      ? localState.cards
      : mergeCards(localState.cards, remoteState.cards);
  const mergedAgentMessages = agentChoice === 'remote'
    ? remoteState.agent.messages
    : agentChoice === 'local'
      ? localState.agent.messages
      : mergeGenericTimeline(localState.agent.messages, remoteState.agent.messages, 'message');
  const mergedAgentComments = agentChoice === 'remote'
    ? remoteState.agent.comments
    : agentChoice === 'local'
      ? localState.agent.comments
      : mergeGenericTimeline(localState.agent.comments, remoteState.agent.comments, 'comment');
  const mergedVersions = mergeGenericTimeline(
    localState.hypothesis.versions,
    remoteState.hypothesis.versions,
    'version'
  );

  return {
    ...remoteState,
    header: headerChoice === 'remote' ? remoteState.header : localState.header,
    workspaceDraft: clean(localState.workspaceDraft) || remoteState.workspaceDraft,
    workspaceDraftType: clean(localState.workspaceDraft) ? localState.workspaceDraftType : remoteState.workspaceDraftType,
    importedSourceKeys: [...new Set([
      ...(cardsChoice === 'remote' ? remoteState.importedSourceKeys : []),
      ...(cardsChoice === 'local' ? localState.importedSourceKeys : []),
      ...(cardsChoice === 'merge'
        ? [...remoteState.importedSourceKeys, ...localState.importedSourceKeys]
        : [])
    ])],
    cards: mergedCards,
    hypothesis: {
      html: hypothesisChoice === 'remote' ? remoteState.hypothesis.html : localState.hypothesis.html,
      versions: mergedVersions
    },
    agent: {
      comments: mergedAgentComments,
      messages: mergedAgentMessages
    }
  };
};

export default mergeWorkbenchStates;
