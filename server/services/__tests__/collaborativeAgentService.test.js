const assert = require('assert');
const { __testables } = require('../collaborativeAgentService');

const {
  tokenize,
  buildTokenRegex,
  buildReply,
  buildOutputArtifactReply,
  buildPartnerChatMessages,
  prepareRelatedItemsForReply,
  pruneRelatedItemsForContext
} = __testables;

const run = () => {
  const tokens = tokenize('Find the note about systems thinking and evidence loops in my notebook');
  assert.ok(tokens.includes('systems'), 'Expected systems token.');
  assert.ok(tokens.includes('thinking'), 'Expected thinking token.');
  assert.ok(tokens.includes('evidence'), 'Expected evidence token.');
  assert.ok(!tokens.includes('the'), 'Stopwords should be removed.');

  const regex = buildTokenRegex(['alpha', 'beta']);
  assert.ok(regex instanceof RegExp, 'Expected regex instance.');
  assert.ok(regex.test('hello beta world'), 'Regex should match token text.');
  assert.strictEqual(buildTokenRegex([]), null, 'Empty token list should yield null regex.');

  const prepared = prepareRelatedItemsForReply([
    { type: 'source', id: 'u1', title: 'example.com', snippet: 'https://example.com/world-models' },
    { type: 'notebook', id: 'n1', title: 'Feedback loops', snippet: 'Pressure accumulates before the system changes state.' }
  ]);
  assert.strictEqual(prepared.length, 1, 'Low-signal hostname-only source items should be filtered when richer material exists.');
  assert.strictEqual(prepared[0].title, 'Feedback loops', 'Expected richer notebook item to survive filtering.');

  const pruned = pruneRelatedItemsForContext({
    context: { type: 'article', id: 'a1', title: 'World Models' },
    contextItem: { type: 'article', id: 'a1', title: 'World Models' },
    relatedItems: [
      { type: 'article', id: 'a1', title: 'World Models', snippet: 'The current article.' },
      { type: 'notebook', id: 'n1', title: 'Feedback loops', snippet: 'Pressure accumulates before the system changes state.' }
    ]
  });
  assert.strictEqual(pruned.length, 1, 'Context echo items should be removed from the reply payload when richer related items exist.');
  assert.strictEqual(pruned[0].title, 'Feedback loops', 'Expected the non-echo related item to remain.');

  const reply = buildReply({
    message: 'Summarize what matters most here',
    context: {
      type: 'concept',
      id: 'c1',
      title: 'Systems Thinking',
      metadata: {
        primaryText: 'Systems that look stable can still hide delayed feedback. Pressure accumulates before the system changes state. The risk is that surface calm hides real fragility.'
      }
    },
    contextItem: { type: 'concept', title: 'Systems Thinking', snippet: 'A concept about loops and feedback.' },
    relatedItems: [
      { type: 'source', id: 'u1', title: 'example.com', snippet: 'https://example.com/world-models' },
      { type: 'notebook', id: 'n1', title: 'Feedback loops', snippet: 'Pressure accumulates before the system changes state.' }
    ]
  });
  assert.ok(reply.includes('Core claim:'), 'Reply should produce a structured summary.');
  assert.ok(reply.includes('Best support in view:'), 'Reply should include a support line.');
  assert.ok(reply.includes('Pressure to keep in view:'), 'Reply should include a pressure/tension line when one is available.');
  assert.ok(!reply.includes('example.com'), 'Reply should not surface low-signal hostname labels.');
  assert.ok(!reply.includes('...'), 'Reply prose should not surface clipped ellipsis fragments.');

  const articleReply = buildReply({
    message: 'Summarize what matters most in this article',
    context: {
      type: 'article',
      id: 'a1',
      title: 'World Models',
      metadata: {
        primaryText: 'World models compress experience into latent simulations. The promise is that agents can plan in imagination before acting. The risk is that abstraction can drift away from the ground truth it is supposed to explain.'
      }
    },
    contextItem: { type: 'article', title: 'World Models', snippet: 'World models compress experience into latent simulations. The promise is that agents can plan in imagination before acting. The risk is that abstraction can drift away from the ground truth it is supposed to explain.' },
    relatedItems: [
      {
        type: 'article',
        id: 'a1',
        title: 'World Models',
        snippet: 'World models compress experience into latent simulations. The promise is that agents can plan in imagination before acting. The risk is that abstraction can drift away from the ground truth it is supposed to explain.'
      }
    ]
  });
  assert.ok(articleReply.includes('Core claim: World models compress experience into latent simulations.'), 'Article summaries should keep the first full claim sentence.');
  assert.ok(articleReply.includes('Best support in view: The promise is that agents can plan in imagination before acting.'), 'Article summaries should surface a complete support sentence.');
  assert.ok(!articleReply.includes('The risk is that...'), 'Article summaries should not leak truncated support fragments.');

  const noRelatedArticleReply = buildReply({
    message: 'Summarize what matters most in this article',
    context: {
      type: 'article',
      id: 'a1',
      title: 'World Models',
      metadata: {
        primaryText: 'World models compress experience into latent simulations. The promise is that agents can plan in imagination before acting. The risk is that abstraction can drift away from the ground truth it is supposed to explain.'
      }
    },
    contextItem: { type: 'article', title: 'World Models', snippet: 'World models compress experience into latent simulations. The promise is that agents can plan in imagination before acting. The risk is that abstraction can drift away from the ground truth it is supposed to explain.' },
    relatedItems: []
  });
  assert.ok(noRelatedArticleReply.startsWith('Core claim:'), 'Article summaries should still summarize the current article when no related items surface.');

  const newsletterArticleReply = buildReply({
    message: 'Summarize what matters most in this article',
    context: {
      type: 'article',
      id: 'a2',
      title: 'World Models: Computing the Uncomputable',
      metadata: {
        primaryText: 'Welcome to the 458 newly Not Boring people who have joined us since our last essay. Join 260,170 smart, curious folks by subscribing here: Hi friends. A few months ago, Pim De Witte and Kent Rollins invited me to their office right here in New York City. What they showed me that day was a class of models that learn to predict the near future from action-labeled video. World models matter because agents can plan in imagination before they act. The risk is that abstraction can drift away from the ground truth it is supposed to explain.'
      }
    },
    contextItem: {
      type: 'article',
      title: 'World Models: Computing the Uncomputable',
      snippet: 'Welcome to the 458 newly Not Boring people who have joined us since our last essay. Join 260,170 smart, curious folks by subscribing here: Hi friends. A few months ago, Pim De Witte and Kent Rollins invited me to their office right here in New York City. What they showed me that day was a class of models that learn to predict the near future from action-labeled video. World models matter because agents can plan in imagination before they act. The risk is that abstraction can drift away from the ground truth it is supposed to explain.'
    },
    relatedItems: []
  });
  assert.ok(newsletterArticleReply.startsWith('Core claim:'), 'Newsletter-style article summaries should still produce a structured synthesis.');
  assert.ok(!newsletterArticleReply.includes('Hi friends'), 'Newsletter-style boilerplate should be filtered out of article summaries.');
  assert.ok(!newsletterArticleReply.includes('Join 260,170'), 'Subscription boilerplate should be filtered out of article summaries.');
  assert.ok(
    newsletterArticleReply.includes('What they showed me that day was a class of models that learn to predict the near future from action-labeled video.')
      || newsletterArticleReply.includes('World models matter because agents can plan in imagination before they act.'),
    'Newsletter-style article summaries should keep substantive article claims.'
  );

  const ambientMetadataArticleReply = buildReply({
    message: 'Summarize what matters most in this article',
    context: {
      type: 'article',
      id: 'a3',
      title: 'World Models: Computing the Uncomputable',
      metadata: {
        summary: 'Source host: example.com.',
        primaryText: ''
      }
    },
    contextItem: {
      type: 'article',
      title: 'World Models: Computing the Uncomputable',
      snippet: 'World models matter because agents can plan in imagination before they act. The risk is that abstraction can drift away from the ground truth it is supposed to explain.'
    },
    relatedItems: []
  });
  assert.ok(ambientMetadataArticleReply.includes('World models matter because agents can plan in imagination before they act.'), 'Article summaries should prefer substantive article text over ambient host metadata.');
  assert.ok(!ambientMetadataArticleReply.includes('example.com'), 'Article summaries should not surface source-host metadata as a claim.');

  const genericQuestionReply = buildReply({
    message: 'What is this question really asking?',
    context: {
      type: 'question',
      id: 'q1',
      title: 'New question',
      metadata: {
        primaryText: 'No supporting material is attached yet.'
      }
    },
    contextItem: {
      type: 'question',
      title: 'New question',
      snippet: 'No supporting material is attached yet.'
    },
    relatedItems: [
      {
        type: 'notebook',
        id: 'n1',
        title: 'QA Flow v1 notebook draft',
        snippet: 'A notebook draft about the active concept workspace.'
      }
    ]
  });
  assert.strictEqual(
    genericQuestionReply,
    'This question is still too generic. Rewrite it so it names the uncertainty, decision, or contradiction you want resolved, then I can gather the right evidence.',
    'Placeholder questions should return an honest rewrite prompt instead of stitched retrieval copy.'
  );

  const summaryBrief = buildOutputArtifactReply({
    skillInvocation: { outputType: 'summary_brief' },
    context: {
      type: 'article',
      title: 'World Models',
      metadata: {
        summary: 'A useful working frame is to ask when a world model sharpens decision-making and when it only produces elegant hallucination.',
        primaryText: 'World models compress experience into latent simulations. The promise is that agents can plan in imagination before acting. The risk is that abstraction can drift away from the ground truth it is supposed to explain.',
        nextActions: ['Test when the model sharpens decisions versus when it only sounds coherent.']
      }
    },
    contextItem: {
      type: 'article',
      title: 'World Models',
      snippet: 'World models compress experience into latent simulations. The promise is that agents can plan in imagination before acting. The risk is that abstraction can drift away from the ground truth it is supposed to explain.'
    },
    relatedItems: [
      { type: 'notebook', id: 'n1', title: 'Ground truth checks', snippet: 'Planning only helps if the model keeps checking itself against the world.' }
    ]
  });
  assert.ok(summaryBrief.startsWith('# Summary Brief: World Models'), 'Summary brief artifacts should render as structured drafts.');
  assert.ok(summaryBrief.includes('## Core claim'), 'Summary brief artifacts should include an explicit core claim section.');
  assert.ok(summaryBrief.includes('## Next move'), 'Summary brief artifacts should include a next move section.');

  const hfMessages = buildPartnerChatMessages({
    message: 'What do you think needs to be rethought?',
    conversationState: {
      resolvedMessage: 'What do you think needs to be rethought?',
      history: [
        { role: 'user', text: 'Can you pull in more investing material?' },
        { role: 'assistant', text: 'I found a few source leads around world models and market structure.' }
      ]
    },
    context: {
      type: 'concept',
      id: 'c1',
      title: 'Investing',
      metadata: {
        summary: 'The active concept is trying to connect world models, investing, and decision quality.',
        openQuestions: ['What kind of evidence would show whether this belongs in investing or only in AI systems?']
      }
    },
    contextItem: {
      type: 'concept',
      id: 'c1',
      title: 'Investing',
      snippet: 'A concept draft about investing, world models, and decision quality.'
    },
    relatedItems: [
      {
        type: 'article',
        id: 'a1',
        title: 'World Models: Computing the Uncomputable',
        snippet: 'World models matter because agents can plan in imagination before they act.'
      },
      {
        type: 'notebook',
        id: 'n1',
        title: 'White Collar PEDs',
        snippet: 'The draft risks grabbing fashionable abstractions without naming the investing edge.'
      }
    ]
  });
  assert.ok(Array.isArray(hfMessages), 'HF partner messages should be built as an array.');
  assert.ok(hfMessages.length >= 4, 'HF partner messages should include grounding, history, and the active prompt.');
  assert.ok(
    hfMessages.some((entry) => entry.role === 'system' && entry.content.includes('grounded thought partner')),
    'HF partner messages should include a grounding system instruction.'
  );
  assert.ok(
    hfMessages.some((entry) => entry.role === 'user' && entry.content.includes('Retrieved internal material')),
    'HF partner messages should include the retrieved internal material block.'
  );
  assert.ok(
    hfMessages.some((entry) => entry.role === 'assistant' && entry.content.includes('world models and market structure')),
    'HF partner messages should carry forward recent conversation turns.'
  );
  assert.strictEqual(
    hfMessages.at(-1)?.content,
    'What do you think needs to be rethought?',
    'HF partner messages should end with the current user request.'
  );
};

if (require.main === module) {
  try {
    run();
    console.log('collaborativeAgentService tests passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = { run };
