const assert = require('assert');
const { inferAgentReplyIntent, resolveAgentIntent } = require('../agentIntentKernel');

const expectDecision = (message, expected, input = {}) => {
  const decision = resolveAgentIntent({
    message,
    context: { type: 'notebook', id: 'note-1', title: 'Working note' },
    ...input
  });
  Object.entries(expected).forEach(([key, value]) => {
    assert.deepStrictEqual(decision[key], value, `${message}: expected ${key}=${JSON.stringify(value)}.`);
  });
  return decision;
};

const run = () => {
  expectDecision('What evidence would change that recommendation?', {
    replyIntent: 'challenge',
    interactionMode: 'answer',
    answerFocus: 'falsifier',
    retrievalPolicy: 'context',
    plannerPolicy: 'hidden',
    proposalPolicy: 'none'
  });

  expectDecision('What do these sources actually prove?', {
    replyIntent: 'answer',
    interactionMode: 'answer',
    retrievalPolicy: 'context',
    plannerPolicy: 'hidden',
    proposalPolicy: 'none'
  });

  expectDecision('Find the strongest sources about market structure.', {
    replyIntent: 'retrieve',
    interactionMode: 'retrieve',
    retrievalPolicy: 'workspace',
    plannerPolicy: 'hidden',
    proposalPolicy: 'none'
  });

  expectDecision('Pull the strongest sources into this note.', {
    replyIntent: 'retrieve',
    interactionMode: 'act',
    retrievalPolicy: 'workspace',
    plannerPolicy: 'show',
    proposalPolicy: 'stage'
  });

  expectDecision('Rewrite this into a sharper claim.', {
    replyIntent: 'clarify',
    interactionMode: 'act',
    plannerPolicy: 'show',
    proposalPolicy: 'stage'
  });

  expectDecision('Give me a plan for testing this claim.', {
    replyIntent: 'plan',
    interactionMode: 'plan',
    plannerPolicy: 'show',
    proposalPolicy: 'none'
  });

  const clarification = expectDecision('Can you help?', {
    replyIntent: 'clarify_request',
    interactionMode: 'clarify',
    retrievalPolicy: 'context',
    plannerPolicy: 'hidden',
    proposalPolicy: 'none'
  });
  assert.match(clarification.clarificationPrompt, /answer from the current material/i);

  expectDecision('Clean up library structure and stage a reviewable organization plan.', {
    replyIntent: 'cleanup_structure',
    interactionMode: 'act',
    retrievalPolicy: 'workspace',
    plannerPolicy: 'show',
    proposalPolicy: 'stage'
  });

  const continuationState = {
    continuation: true,
    previousAssistantMessage: { text: 'I can clean up the library and stage an organization plan.' }
  };
  assert.strictEqual(
    inferAgentReplyIntent({ message: 'Ok do that', conversationState: continuationState }),
    'cleanup_structure'
  );

  expectDecision('Ok', {
    replyIntent: 'continue',
    interactionMode: 'answer',
    plannerPolicy: 'hidden',
    proposalPolicy: 'none'
  }, {
    conversationState: {
      continuation: true,
      previousAssistantMessage: { text: 'That claim is well supported by the current page.' }
    }
  });
};

if (require.main === module) {
  try {
    run();
    console.log('agentIntentKernel tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
