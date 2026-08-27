const clean = (value) => String(value || '').trim();

const PATTERNS = Object.freeze({
  questionDepth: /\b(what is this question really asking|really asking|what is the real question|what is this actually asking)\b/i,
  orientationContext: /\b(what am i looking at|what is this|what's this|where am i|what page is this|what object is this|what is open|what's in view|what am i reading)\b/i,
  orientationUsage: /\b(where else is this used|where is this used|what uses this|who cites this|what references this|referenced by|backlinks?|where else does this appear|where else is this cited)\b/i,
  orientationReturn: /\b(what should i (?:reopen|resume|open|read|work on|do) next|where should i (?:start|resume|reopen)|what(?:'s| is) worth (?:reopening|resuming|reading)|what should i come back to|what needs attention next|what is the next move)\b/i,
  cleanup: /\b(organize|organise|reorganize|reorganise|cleanup structure|clean up structure|clean up (?:the )?library|cleanup library|library cleanup|folder cleanup|folder structure|workspace cleanup|organize (?:the )?library|organize notebook|organize workspace|stage a reviewable organization plan)\b/i,
  summarize: /\b(summarize|summary|distill|what matters|key claim|brief|synthesis)\b/i,
  challenge: /\b(challenge|push back|pressure|weak|hole|counter|falsif|rethink|rethought|what evidence would change|what would change (?:that|this|your) (?:view|answer|recommendation))\b/i,
  restructure: /\b(restructure|bucket|sort|cluster)\b/i,
  rewrite: /\b(rewrite|revise|edit|polish|redraft|make (?:this|it) clearer|clean up (?:this|the) (?:draft|copy|wording))\b/i,
  clarify: /\b(clarify|sharper|clearer|explain what .* means)\b/i,
  strengthen: /\b(strengthen|make (?:this|it) stronger|firm up)\b/i,
  retrieve: /\b(bring|pull|find|surface|get me|show me|search|look for)\b|^(?:notes|highlights|sources|articles|material)\b/i,
  mutatingRetrieve: /\b(pull in|bring in|attach|add|reference|connect)\b|\b(?:pull|bring)\b[\s\S]{0,80}\binto\b/i,
  plan: /\b(make|build|draft|give me|create|form|lay out) (?:a |the )?plan\b|\bwhat (?:are|should be) the (?:next )?steps\b|\bhow should (?:i|we) (?:approach|do|tackle|execute|build)\b/i,
  executionContinuation: /\b(yes|yep|yeah|ok|okay|sure|do that|please do that|go ahead|sounds good|use that|pull them in|bring them in|continue)\b/i,
  executionOffer: /\b(pull|bring|attach|add|reference|connect|stage|apply|execute)\b/i,
  vague: /^(?:help|help me|can you help|do something|work on this|what can you do|take a look|thoughts|continue)$/i,
  question: /\?|^(?:what|why|how|when|where|which|who|can|could|would|should|does|do|is|are|will)\b/i
});

const actionDecision = (replyIntent, overrides = {}) => ({
  replyIntent,
  interactionMode: 'act',
  retrievalPolicy: replyIntent === 'cleanup_structure' ? 'workspace' : 'context',
  plannerPolicy: 'show',
  proposalPolicy: 'stage',
  clarificationPrompt: '',
  ...overrides
});

const answerDecision = (replyIntent = 'chat', overrides = {}) => ({
  replyIntent,
  interactionMode: 'answer',
  retrievalPolicy: 'context',
  plannerPolicy: 'hidden',
  proposalPolicy: 'none',
  clarificationPrompt: '',
  answerFocus: 'direct',
  ...overrides
});

const inferContinuationIntent = (assistantText = '') => {
  const lower = clean(assistantText).toLowerCase();
  if (PATTERNS.cleanup.test(lower)) return 'cleanup_structure';
  if (PATTERNS.restructure.test(lower)) return 'restructure';
  if (PATTERNS.executionOffer.test(lower) && PATTERNS.retrieve.test(lower)) return 'retrieve';
  if (PATTERNS.strengthen.test(lower)) return 'strengthen';
  if (PATTERNS.challenge.test(lower)) return 'challenge';
  if (PATTERNS.rewrite.test(lower) || PATTERNS.clarify.test(lower)) return 'clarify';
  return '';
};

const resolveAgentIntent = ({ message = '', conversationState = {}, context = {} } = {}) => {
  const safeMessage = clean(message);
  const lower = safeMessage.toLowerCase();
  const hasContext = Boolean(clean(context?.id || context?.title));

  if (PATTERNS.questionDepth.test(lower)) return answerDecision('summarize');
  if (PATTERNS.orientationUsage.test(lower)) return answerDecision('show_usage');
  if (PATTERNS.orientationReturn.test(lower) || PATTERNS.orientationContext.test(lower)) {
    return answerDecision('orient_context', { retrievalPolicy: 'workspace' });
  }
  if (PATTERNS.cleanup.test(lower)) return actionDecision('cleanup_structure');
  if (PATTERNS.rewrite.test(lower)) return actionDecision('clarify');
  if (PATTERNS.restructure.test(lower)) return actionDecision('restructure');
  if (PATTERNS.strengthen.test(lower)) return actionDecision('strengthen');
  if (PATTERNS.summarize.test(lower)) return answerDecision('summarize');
  if (PATTERNS.challenge.test(lower)) {
    return answerDecision('challenge', {
      answerFocus: /\b(?:what evidence would change|what would change (?:that|this|your) (?:view|answer|recommendation))\b/i.test(lower)
        ? 'falsifier'
        : 'pressure_test'
    });
  }
  if (PATTERNS.plan.test(lower)) {
    return answerDecision('plan', {
      interactionMode: 'plan',
      retrievalPolicy: hasContext ? 'context' : 'workspace',
      plannerPolicy: 'show'
    });
  }
  if (PATTERNS.retrieve.test(lower)) {
    const stagesMaterial = PATTERNS.mutatingRetrieve.test(lower);
    return answerDecision('retrieve', {
      interactionMode: stagesMaterial ? 'act' : 'retrieve',
      retrievalPolicy: 'workspace',
      plannerPolicy: stagesMaterial ? 'show' : 'hidden',
      proposalPolicy: stagesMaterial ? 'stage' : 'none'
    });
  }
  if (PATTERNS.clarify.test(lower)) return answerDecision('clarify');

  if (conversationState?.continuation && PATTERNS.executionContinuation.test(lower)) {
    const continuedIntent = inferContinuationIntent(conversationState?.previousAssistantMessage?.text);
    return continuedIntent
      ? actionDecision(continuedIntent)
      : answerDecision('continue');
  }

  if (PATTERNS.vague.test(lower.replace(/[?!.]+$/g, '')) && !conversationState?.continuation) {
    return answerDecision('clarify_request', {
      interactionMode: 'clarify',
      clarificationPrompt: hasContext
        ? 'What would be most useful here: an answer from the current material, a search across your workspace, or a reviewable change?'
        : 'What are you trying to accomplish: understand something, find material, make a plan, or stage a reviewable change?'
    });
  }

  if (PATTERNS.question.test(lower)) return answerDecision('answer');
  return answerDecision(conversationState?.continuation ? 'continue' : 'chat');
};

const inferAgentReplyIntent = (input = {}) => resolveAgentIntent(input).replyIntent;

module.exports = {
  PATTERNS,
  inferAgentReplyIntent,
  resolveAgentIntent
};
