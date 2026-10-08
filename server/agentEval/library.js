// A small reading life, written for the eval: ten sources, two notebook pages,
// one concept and one view the reader holds. Every question in cases.js is
// answerable from this text alone — or, for the abstention cases, deliberately
// not.

const SOURCES = Object.freeze({
  checklists: {
    title: 'Why checklists beat expertise in complex work',
    url: 'https://eval.noeis.local/checklists',
    paragraphs: [
      'In fields where the work is both complex and routine, the most common failures are not failures of knowledge but failures of execution. Experienced surgeons, pilots, and engineers know what to do; they fail because a step gets skipped under pressure, or because two people each assume the other handled it.',
      'A good checklist is not a recipe. It is short, it targets the steps that are easy to forget and costly to miss, and it creates a moment where the team must speak to each other. The pause matters as much as the items: saying names and roles out loud flattens hierarchy enough that a junior person will flag a problem.',
      'The resistance to checklists is mostly about identity. Experts experience a checklist as an insult to their judgment. Yet hospitals that adopted a two-minute surgical safety checklist saw complications fall, and most of the staff who resisted said they would want it used if they were the patient.',
      'Judgment and procedure are not opposites. Procedure handles the predictable so that judgment can be spent on the unpredictable.'
    ],
    highlights: [
      { text: 'The resistance to checklists is mostly about identity.', note: 'Same thing happens with code review checklists on my team; the seniors skip them.' },
      { text: 'Procedure handles the predictable so that judgment can be spent on the unpredictable.', note: '' }
    ]
  },
  baseRates: {
    title: 'Start with the base rate, then tell the story',
    url: 'https://eval.noeis.local/base-rates',
    paragraphs: [
      'When a plan comes with a vivid story, people forecast from the inside: they imagine the steps and add up the time. The inside view is almost always too optimistic because it cannot see the delays nobody has imagined yet.',
      'The correction is to begin with the reference class. Before you trust the story, ask how long projects like this one usually take and how often they succeed at all. Anchor on that number, then adjust only for differences you can name.',
      'A skeptic will say no two projects are alike, so no reference class fits. The answer is that an imperfect class still beats none: the error from a rough base rate is usually smaller than the error from optimism.'
    ],
    highlights: [
      { text: 'Before you trust the story, ask how long projects like this one usually take and how often they succeed at all.', note: 'Use this before approving any roadmap estimate.' }
    ]
  },
  premortem: {
    title: 'Run the premortem before the kickoff',
    url: 'https://eval.noeis.local/premortem',
    paragraphs: [
      'A premortem asks the team to assume the plan has already failed, a year from now, and to write down why. The framing matters: people who would never criticize a plan in a kickoff will happily explain a failure that has supposedly already happened.',
      'It works because it gives dissent a legitimate job. The quiet engineer who doubts the vendor is no longer being negative; she is completing the exercise.',
      'Like a checklist, a premortem is a small procedure that protects judgment from the social pressure of the room.'
    ],
    highlights: []
  },
  goodhart: {
    title: 'When the measure became the target in our sales team',
    url: 'https://eval.noeis.local/goodhart',
    paragraphs: [
      'We started paying the sales team on calls logged, because calls seemed to predict revenue. Within a quarter the number of logged calls doubled and revenue did not move.',
      'Nobody cheated in an obvious way. People logged voicemails, split one conversation into three, and called the friendliest accounts twice. The metric kept rising after it had stopped meaning anything.',
      'A number that people are rewarded on stops measuring the thing it used to measure. The fix was to pay on outcomes we could not easily fake and to rotate the indicators we only watched.'
    ],
    highlights: [
      { text: 'The metric kept rising after it had stopped meaning anything.', note: 'This is our support-ticket SLA right now.' }
    ]
  },
  marginOfSafety: {
    title: 'Margin of safety, from bridges to balance sheets',
    url: 'https://eval.noeis.local/margin-of-safety',
    paragraphs: [
      'Engineers design a bridge to carry several times the load they expect, not because they think the expected load is wrong, but because they know their model of the world is incomplete.',
      'Investors borrow the idea when they insist on buying well below their estimate of value. The gap is not a bonus; it is room for being wrong about things you did not know to model.',
      'A margin of safety is the price you pay in advance for the errors you cannot see. It is cheapest when it is built in before anyone is under pressure.'
    ],
    highlights: []
  },
  deliberatePractice: {
    title: 'Deliberate practice is supposed to be uncomfortable',
    url: 'https://eval.noeis.local/deliberate-practice',
    paragraphs: [
      'Most experienced people stop improving because they practice what they are already good at. Ten years of experience can be one year repeated ten times.',
      'Deliberate practice targets the edge of current ability, with fast feedback and a specific goal for each session. It feels worse than ordinary practice, which is how you know it is working.',
      'Expertise built this way is narrow. A chess master is not a better negotiator, and the confidence earned in one domain does not transfer to the next.'
    ],
    highlights: []
  },
  meetings: {
    title: 'The real price of a one-hour meeting',
    url: 'https://eval.noeis.local/meetings',
    paragraphs: [
      'A one-hour meeting with eight people costs eight hours, but the larger cost is what those eight hours would otherwise have produced. The calendar records the time spent and never the work that did not happen.',
      'Makers lose more than the hour itself. A meeting in the middle of the afternoon splits it into two pieces too short for deep work.',
      'The cheapest meeting is a written memo that people can answer when they are ready.'
    ],
    highlights: []
  },
  incumbents: {
    title: 'Why incumbents miss the next market',
    url: 'https://eval.noeis.local/incumbents',
    paragraphs: [
      'Large companies rarely miss new markets because their managers are foolish. They miss them because every incentive points toward the best existing customers, who do not want the new, cheaper product.',
      'The new market looks small and low-margin, so a rational budgeting process starves it. By the time it is large enough to matter, a smaller rival already owns it.',
      'The companies that adapt usually do it by creating a separate unit that is rewarded on different numbers.'
    ],
    highlights: []
  },
  sleep: {
    title: 'Sleep debt and the quality of decisions',
    url: 'https://eval.noeis.local/sleep',
    paragraphs: [
      'After a night of poor sleep, people make riskier choices and feel more confident about them. Exhaustion degrades judgment while leaving the feeling of judgment intact.',
      'Sleep-deprived managers in one study rated their own decisions as good as their rested colleagues did, even when an outside panel scored them clearly worse.',
      'The practical rule is to move irreversible decisions to the morning and to distrust certainty at midnight.'
    ],
    highlights: []
  },
  writing: {
    title: 'Writing is how you find out what you think',
    url: 'https://eval.noeis.local/writing',
    paragraphs: [
      'A thought that feels finished in your head often falls apart on the page. Writing exposes the step you skipped and the term you never defined.',
      'Treat a draft as a test of your understanding rather than a report of it. If you cannot write the paragraph, you do not yet understand the idea.',
      'Writing regularly is a kind of deliberate practice for thinking: it is uncomfortable, it gives immediate feedback, and it works at the edge of what you can do.'
    ],
    highlights: []
  }
});

const NOTES = Object.freeze({
  reviewRituals: {
    title: 'Team review rituals',
    content: 'Two rituals worth trying on the platform team: a short checklist before every release, and a premortem before every quarter plan. Both give the quiet people a sanctioned way to object.',
    tags: ['decision hygiene']
  },
  hiring: {
    title: 'My hiring mistakes',
    content: 'I keep hiring the candidate with the best story in the interview. Next time: look at how often hires from that background worked out before, and only then listen to the story.',
    tags: ['decision hygiene']
  }
});

const CONCEPTS = Object.freeze({
  decisionHygiene: {
    name: 'decision hygiene',
    description: 'Small procedures that protect judgment from noise, pressure and fatigue.'
  }
});

// A view the reader holds, as the Judgment page records it.
const VIEWS = Object.freeze({
  forecasts: {
    title: 'Roadmap forecasts',
    held: 'Our quarterly roadmap forecasts are accurate enough to promise dates to customers.',
    why: ['The plan for each of the last two launches held to its forecast date.'],
    falsifier: 'Most of a quarter\'s plan slips past its forecast date.'
  }
});

const sourceText = (source) => source.paragraphs.join('\n\n');

// Seeds the library for one user and returns a key → id map so cases can name
// sources by key rather than by database id.
const seedLibrary = async ({ userId, Article, NotebookEntry, TagMeta, WikiPage }) => {
  const ids = {};
  for (const [key, source] of Object.entries(SOURCES)) {
    const article = await Article.create({
      userId,
      title: source.title,
      url: source.url,
      content: sourceText(source),
      highlights: source.highlights
    });
    ids[key] = String(article._id);
  }
  for (const [key, note] of Object.entries(NOTES)) {
    const entry = await NotebookEntry.create({ userId, ...note });
    ids[key] = String(entry._id);
  }
  for (const [key, concept] of Object.entries(CONCEPTS)) {
    const tag = await TagMeta.create({ userId, ...concept });
    ids[key] = String(tag._id);
  }
  for (const [key, view] of Object.entries(VIEWS)) {
    const page = await WikiPage.create({
      userId,
      title: view.title,
      slug: key,
      judgment: {
        currentJudgment: view.held,
        status: 'monitoring',
        why: view.why.map((text, index) => ({ reasonId: `why-${index}`, text })),
        falsifiers: [{ falsifierId: 'f-0', text: view.falsifier }]
      }
    });
    ids[key] = String(page._id);
  }
  return ids;
};

// Everything a faithful answer could quote, keyed the same way.
const libraryTexts = () => ({
  ...Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => [
    key,
    [source.title, sourceText(source), ...source.highlights.map(h => h.note)].join('\n')
  ])),
  ...Object.fromEntries(Object.entries(NOTES).map(([key, note]) => [key, `${note.title}\n${note.content}`])),
  ...Object.fromEntries(Object.entries(CONCEPTS).map(([key, concept]) => [key, `${concept.name}\n${concept.description}`])),
  ...Object.fromEntries(Object.entries(VIEWS).map(([key, view]) => [key, [view.title, view.held, ...view.why, view.falsifier].join('\n')]))
});

module.exports = { SOURCES, NOTES, CONCEPTS, VIEWS, seedLibrary, libraryTexts };
