const assert = require('assert');
const { __testables } = require('../collaborativeAgentService');

const {
  tokenize,
  buildTokenRegex,
  buildReply,
  buildOutputArtifactReply,
  inferReplyIntent,
  buildPartnerChatMessages,
  buildWikiClaimSourceReply,
  prepareRelatedItemsForReply,
  pruneRelatedItemsForContext,
  shouldSearchWorkspaceForWikiPage
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

  assert.strictEqual(
    inferReplyIntent({ message: 'Clean up library structure and stage a reviewable organization plan.' }),
    'cleanup_structure',
    'Library cleanup requests should stage organization work instead of falling into copy-polish clarification.'
  );
  assert.strictEqual(
    inferReplyIntent({
      message: 'Ok do that',
      conversationState: {
        continuation: true,
        previousAssistantMessage: {
          text: 'I can clean up the library and stage an organization plan.'
        }
      }
    }),
    'cleanup_structure',
    'Continuation approvals after an organization plan should keep the cleanup execution intent.'
  );

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

  const wikiMessages = buildPartnerChatMessages({
    message: 'What is strongest here?',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Investing is capital allocation.',
      fullText: 'Investing is capital allocation with a margin of safety.',
      sourceText: '[1] Buffett letter — Margin of safety matters.',
      claimText: '- Claim 1: Cash-flow valuation is central. (attached refs: [1])'
    },
    relatedItems: []
  });
  const wikiPrompt = wikiMessages.map(message => message.content).join('\n');
  assert.ok(wikiPrompt.includes('Selected wiki page body'), 'Wiki chat prompt should include selected page body.');
  assert.ok(wikiPrompt.includes('Attached wiki sources'), 'Wiki chat prompt should include attached wiki sources.');
  assert.ok(wikiPrompt.includes('Never ask the user to ingest or attach the current page'), 'Wiki chat prompt should prohibit fake missing-context replies.');
  assert.ok(!wikiPrompt.includes('69fd2e7d212cd5a5f57db144'), 'Wiki chat prompt should not expose raw page ObjectIds to the model.');

  const wikiFallbackReply = buildReply({
    message: 'What does this page say about margin of safety? Answer from the current page only.',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Margin of Safety',
      snippet: 'Margin of safety is the gap between estimated intrinsic value and price paid.',
      fullText: [
        'Margin of safety is the gap between estimated intrinsic value and price paid.',
        'The gap protects against valuation error and adverse surprises.',
        'Investors demand a discount before buying.'
      ].join(' '),
      sourceText: '[1] Graham notes — Conservative appraisal matters.',
      claimText: '- Claim 1: The discount protects against valuation error. (attached refs: [1])'
    },
    relatedItems: []
  });
  assert.match(wikiFallbackReply, /gap between estimated intrinsic value and price paid/i);
  assert.ok(!/not enough attached material|Point me at/i.test(wikiFallbackReply), 'Wiki fallback should answer from the selected page body instead of asking for the already-loaded page.');

  const pageScopedReply = buildReply({
    message: 'What does the page say about the Mr. Market metaphor?',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Mr. Market is a behavioral metaphor.',
      fullText: 'The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.',
      sourceText: '[1] Berkshire letter — Mr. Market discussion.',
      claimText: '- Claim 1: Mr. Market frames sentiment swings. (attached refs: [1])'
    },
    relatedItems: [
      {
        type: 'article',
        id: 'a-cerebras',
        title: 'Cerebras Wafer Scale Hardware',
        snippet: 'Cerebras shipped unusually large AI chips.'
      }
    ]
  });
  assert.match(pageScopedReply, /prices swing between pessimism and optimism/i);
  assert.ok(!/Cerebras|wafer/i.test(pageScopedReply), 'Page-scoped wiki answers should not bleed unrelated workspace retrieval into the response.');

  const exactWikiSentenceReply = buildReply({
    message: 'Quote the exact sentence about the Mr. Market metaphor.',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Mr. Market is a behavioral metaphor.',
      fullText: 'The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.',
      sourceText: '[1] Berkshire letter — Mr. Market discussion.',
      claimText: '- Claim 1: Mr. Market frames sentiment swings. (attached refs: [1])'
    },
    relatedItems: []
  });
  assert.strictEqual(
    exactWikiSentenceReply,
    'Exact sentence: "The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors."',
    'Exact wiki quote requests should preserve the selected page sentence instead of paraphrasing it.'
  );

  const exactWikiSentenceFromPageReply = buildReply({
    message: 'Quote the exact sentence about Mr. Market from this page.',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Mr. Market is a behavioral metaphor.',
      fullText: [
        'Investors should distinguish price from value.',
        'The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.',
        'Mr. Market discipline matters when markets are loud.'
      ].join(' '),
      sourceText: '[1] Berkshire letter — Mr. Market discussion.',
      claimText: '- Claim 1: Mr. Market frames sentiment swings. (attached refs: [1])'
    },
    relatedItems: []
  });
  assert.strictEqual(
    exactWikiSentenceFromPageReply,
    'Exact sentence: "The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors."',
    'Exact wiki quote requests should return one best matching sentence, not every page sentence mentioning the term.'
  );

  const exactWikiSentenceWithHeadingsReply = buildReply({
    message: 'Quote the exact sentence about Mr. Market from this page.',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Mr. Market is a behavioral metaphor.',
      fullText: [
        'Overview',
        'Investors should distinguish price from value.',
        'Diverging Evidence',
        'The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.'
      ].join(' '),
      sourceText: '[1] Berkshire letter — Mr. Market discussion.',
      claimText: '- Claim 1: Mr. Market frames sentiment swings. (attached refs: [1])'
    },
    relatedItems: []
  });
  assert.strictEqual(
    exactWikiSentenceWithHeadingsReply,
    'Exact sentence: "The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors."',
    'Exact wiki quote requests should not stitch section headings into the quoted sentence.'
  );

  const exactWikiSentenceWithDuplicatePunctuationReply = buildReply({
    message: 'Quote the exact sentence about Mr. Market from this page.',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Mr. Market is a behavioral metaphor.',
      fullText: 'The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.”.',
      sourceText: '[1] Berkshire letter — Mr. Market discussion.',
      claimText: '- Claim 1: Mr. Market frames sentiment swings. (attached refs: [1])'
    },
    relatedItems: []
  });
  assert.strictEqual(
    exactWikiSentenceWithDuplicatePunctuationReply,
    'Exact sentence: "The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors."',
    'Exact wiki quote requests should remove duplicated punctuation around closing quotes.'
  );

  const unrelatedWikiQuestionReply = buildReply({
    message: 'What is the weather in Chicago?',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Mr. Market is a behavioral metaphor.',
      fullText: 'The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.',
      sourceText: '[1] Berkshire letter — Mr. Market discussion.',
      claimText: '- Claim 1: Mr. Market frames sentiment swings. (attached refs: [1])'
    },
    relatedItems: []
  });
  assert.match(unrelatedWikiQuestionReply, /do not see that answered on this page/i);
  assert.ok(!/Mr\. Market/i.test(unrelatedWikiQuestionReply), 'Unrelated page questions should not dump page prose as a fake answer.');

  const wikiSignalHeadingReply = buildReply({
    message: 'Summarize this page.',
    context: { type: 'workspace', id: 'wiki', pageId: '69fd2e7d212cd5a5f57db144' },
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      snippet: 'Diverging Evidence Some investors disagree that valuation models should ignore market sentiment.',
      sources: [{ index: 1, title: 'Source memo' }]
    },
    relatedItems: []
  });
  assert.ok(!/Diverging Evidence/i.test(wikiSignalHeadingReply), 'Wiki chat should not stitch section headings into grounded replies.');
  assert.match(wikiSignalHeadingReply, /Some investors disagree/i);

  const claimSourceReply = buildWikiClaimSourceReply({
    message: 'What source supports the claim that margin of safety protects against valuation error?',
    contextItem: {
      type: 'wiki_page',
      title: 'Margin of Safety',
      claimSourceMap: [
        {
          claim: 'Margin of safety protects against valuation error.',
          refs: [{ index: 1, title: 'The Intelligent Investor', snippet: 'A conservative appraisal discussion.' }]
        },
        {
          claim: 'Diversification can reduce position risk.',
          refs: [{ index: 2, title: 'Portfolio Diversification Memo', snippet: 'Unrelated to margin of safety.' }]
        }
      ]
    }
  });
  assert.match(claimSourceReply, /The Intelligent Investor/i);
  assert.ok(!/Portfolio Diversification Memo/i.test(claimSourceReply), 'Claim attribution should only name refs attached to the matched claim.');

  const uncitedClaimReply = buildWikiClaimSourceReply({
    message: 'What source supports the claim that concentration creates behavioral risk?',
    contextItem: {
      type: 'wiki_page',
      title: 'Investing',
      claimSourceMap: [
        {
          claim: 'Concentration creates behavioral risk.',
          refs: []
        }
      ]
    }
  });
  assert.match(uncitedClaimReply, /no attached source/i);

  assert.strictEqual(
    shouldSearchWorkspaceForWikiPage({ message: 'What does this page say about Mr. Market?' }),
    false,
    'Ordinary ask-this-page questions should stay scoped to the selected wiki page.'
  );
  assert.strictEqual(
    shouldSearchWorkspaceForWikiPage({ message: 'Find related sources across my library about Mr. Market.' }),
    true,
    'Explicit cross-workspace retrieval requests should still search the library.'
  );

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
  assert.ok(summaryBrief.startsWith('# World Models'), 'Article summary artifacts should use the article title directly.');
  assert.ok(!summaryBrief.includes('## Core claim'), 'Article summary artifacts should avoid robotic brief headings.');
  assert.ok(!summaryBrief.includes('## Next move'), 'Article summary artifacts should avoid next-move scaffolding.');

  const longArticleSummaryBrief = buildOutputArtifactReply({
    skillInvocation: { outputType: 'summary_brief' },
    context: {
      type: 'article',
      title: 'Childhoods of exceptional people',
      metadata: {
        summary: 'Source host: henrikkarlsson.xyz.',
        primaryText: '###### Virginia Woolf and her sister, Vanessa, in the 1890s\nLet’s start with one of those insights that are as obvious as they are easy to forget: if you want to master something, you should study the highest achievements of your field.'
      }
    },
    contextItem: {
      type: 'article',
      title: 'Childhoods of exceptional people',
      snippet: 'Let’s start with one of those insights that are as obvious as they are easy to forget.',
      fullText: [
        '<h6>Virginia Woolf and her sister, Vanessa, in the 1890s</h6>',
        '<p>Let’s start with one of those insights that are as obvious as they are easy to forget: if you want to master something, you should study the highest achievements of your field.</p>',
        '<h2>Exceptional people grow up in exceptional milieus</h2>',
        '<p>Those who grow up to be exceptional tend to have spent their formative years surrounded by adults who were exceptional.</p>',
        '<h2>They had time to roam about and relied heavily on self-directed learning</h2>',
        '<p>A lot of care went into curating the environment around the children, but the children were left with a lot of time to freely explore the interests that arose within these milieus.</p>',
        '<h2>They were heavily tutored 1-on-1</h2>',
        '<p>Tutoring is a more reliable method to impart knowledge than lectures. It is also faster.</p>',
        '<h2>Cognitive apprenticeships</h2>',
        '<p>Learning through apprenticeship is one of the most powerful ways of growing skilled, but if the skills are cognitive, you have to find ways to make the thoughts visible so the apprentice can imitate them.</p>',
        '<h1>They were gifted children</h1>',
        '<p>An important factor to acknowledge is that these children did not only receive an exceptional education; they were also exceptionally gifted.</p>'
      ].join('')
    },
    relatedItems: []
  });
  assert.ok(
    /intellectual ecolog/i.test(longArticleSummaryBrief),
    'Long article summary briefs should synthesize the article-specific mechanism, not only the intro.'
  );
  assert.ok(
    /self-directed exploration/i.test(longArticleSummaryBrief),
    'Long article summary briefs should preserve the article structure across sections.'
  );
  assert.ok(
    /apprenticeship/i.test(longArticleSummaryBrief),
    'Long article summary briefs should include late article sections.'
  );
  assert.ok(
    !longArticleSummaryBrief.includes('Source host: henrikkarlsson.xyz.'),
    'Long article summary briefs should not treat host metadata as the article summary.'
  );
  assert.ok(
    !longArticleSummaryBrief.includes('Virginia Woolf and her sister'),
    'Long article summary briefs should not promote image captions as summary claims.'
  );
  assert.ok(
    !longArticleSummaryBrief.includes('## Core claim'),
    'Long article summary briefs should read as flowing prose, not a robotic template.'
  );

  const fallbackArticleSummaryBrief = buildOutputArtifactReply({
    skillInvocation: { outputType: 'summary_brief' },
    context: {
      type: 'article',
      title: 'Childhoods of exceptional people',
      metadata: {
        summary: 'Source host: henrikkarlsson.xyz.',
        primaryText: 'That list is to me a good first approximation of what an exceptional result in the field of child-rearing looks like. As children, they were integrated with exceptional adults—and were taken seriously by them. But this is not what parents usually do when they think about how to educate their kids.'
      }
    },
    contextItem: {
      type: 'article',
      title: 'Childhoods of exceptional people',
      snippet: 'That list is to me a good first approximation of what an exceptional result in the field of child-rearing looks like.'
    },
    relatedItems: [
      { type: 'article', id: 'a2', title: 'Jeffrey Yan turned down $100 million, airdropped billions to strangers, and can’t travel without a bodyguard.', snippet: 'Unrelated retrieved item.' }
    ]
  });
  assert.ok(fallbackArticleSummaryBrief.startsWith('# Childhoods of exceptional people'), 'Fallback article summary should still title the article.');
  assert.ok(!fallbackArticleSummaryBrief.includes('## Core claim'), 'Fallback article summary should not use robotic headings.');
  assert.ok(!fallbackArticleSummaryBrief.includes('Source host: henrikkarlsson.xyz.'), 'Fallback article summary should not surface host metadata.');
  assert.ok(!fallbackArticleSummaryBrief.includes('Jeffrey Yan'), 'Fallback article summary should not append unrelated retrieval as a next move.');
  assert.ok(/ecology|milieu/i.test(fallbackArticleSummaryBrief), 'Fallback article summary should name the article-specific mechanism.');
  assert.ok(/gifted/i.test(fallbackArticleSummaryBrief), 'Fallback article summary should retain the main caveat, not end with generic advice.');

  const childhoodArtifactBase = {
    context: {
      type: 'article',
      title: 'Childhoods of exceptional people',
      metadata: {
        summary: 'Source host: henrikkarlsson.xyz.',
        primaryText: 'That list is to me a good first approximation of what an exceptional result in the field of child-rearing looks like. As children, they were integrated with exceptional adults—and were taken seriously by them. But this is not what parents usually do when they think about how to educate their kids.'
      }
    },
    contextItem: {
      type: 'article',
      title: 'Childhoods of exceptional people',
      snippet: 'That list is to me a good first approximation of what an exceptional result in the field of child-rearing looks like.'
    },
    relatedItems: [
      { type: 'article', id: 'a2', title: 'Jeffrey Yan turned down $100 million, airdropped billions to strangers, and can’t travel without a bodyguard.', snippet: 'Unrelated retrieved item.' }
    ]
  };

  const childhoodCritique = buildOutputArtifactReply({
    skillInvocation: { outputType: 'critique_brief' },
    ...childhoodArtifactBase
  });
  assert.ok(/survivorship bias/i.test(childhoodCritique), 'Article critique should name survivorship bias.');
  assert.ok(/gifted/i.test(childhoodCritique), 'Article critique should preserve the gifted-child caveat.');
  assert.ok(/caus/i.test(childhoodCritique), 'Article critique should pressure-test causality.');
  assert.ok(!childhoodCritique.includes('## Claim under test'), 'Article critique should not use the robotic critique template.');
  assert.ok(!childhoodCritique.includes('Jeffrey Yan'), 'Article critique should not import unrelated retrieval noise.');

  const childhoodQuestions = buildOutputArtifactReply({
    skillInvocation: { outputType: 'question_set' },
    ...childhoodArtifactBase
  });
  assert.ok(/Which part of the ecology/i.test(childhoodQuestions), 'Article questions should ask about the causal mechanism.');
  assert.ok(/adult seriousness/i.test(childhoodQuestions), 'Article questions should name adult seriousness.');
  assert.ok(/inherited ability|gifted/i.test(childhoodQuestions), 'Article questions should name inherited ability or giftedness.');
  assert.ok(!childhoodQuestions.includes('What evidence would answer this pressure directly'), 'Article questions should avoid generic evidence prompts.');

  const childhoodConnections = buildOutputArtifactReply({
    skillInvocation: { outputType: 'connection_map' },
    ...childhoodArtifactBase
  });
  assert.ok(/Cognitive apprenticeship/i.test(childhoodConnections), 'Article connections should identify cognitive apprenticeship as a specific connection.');
  assert.ok(/Self-directed exploration/i.test(childhoodConnections), 'Article connections should identify self-directed exploration as a specific connection.');
  assert.ok(/support|tension|counterexample/i.test(childhoodConnections), 'Article connections should classify connection types.');
  assert.ok(!childhoodConnections.includes('Jeffrey Yan'), 'Article connections should not include unrelated retrieval noise.');

  const childhoodNote = buildOutputArtifactReply({
    skillInvocation: { outputType: 'note_draft' },
    ...childhoodArtifactBase
  });
  assert.ok(childhoodNote.startsWith('# Exceptional Childhood as Intellectual Ecology'), 'Article note draft should have a strong synthesized title.');
  assert.ok(/intellectual ecology/i.test(childhoodNote), 'Article note draft should synthesize the mechanism.');
  assert.ok(/survivorship bias|gifted/i.test(childhoodNote), 'Article note draft should carry the caveat.');
  assert.ok(!childhoodNote.includes('Source host'), 'Article note draft should not leak host metadata.');

  const childhoodConcept = buildOutputArtifactReply({
    skillInvocation: { outputType: 'concept_draft' },
    ...childhoodArtifactBase
  });
  assert.ok(childhoodConcept.startsWith('# Concept Candidate: Intellectual Ecology of Childhood'), 'Article concept draft should name the concept.');
  assert.ok(/Thesis:/i.test(childhoodConcept), 'Article concept draft should include a thesis.');
  assert.ok(/Starting evidence:/i.test(childhoodConcept), 'Article concept draft should include starting evidence.');
  assert.ok(/Boundary:/i.test(childhoodConcept), 'Article concept draft should include a boundary/caveat.');
  assert.ok(!childhoodConcept.includes('Jeffrey Yan'), 'Article concept draft should not include unrelated retrieval noise.');

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
