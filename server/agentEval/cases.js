// The questions a reader actually asks of their own library. `surface` is where
// the question is asked from; `sources` must all be found and drawn on; `oneOf`
// needs at least one of its members as well; `allowed` may be cited without
// being required, because it answers the question too. `abstain` cases have no answer in
// the library, and the only good reply says so without citing anything.

const CASES = Object.freeze([
  // On one source, asked from the reader.
  { id: 'objection', surface: 'article:checklists', ask: 'What is the strongest objection to this argument?', sources: ['checklists'] },
  { id: 'summary', surface: 'article:checklists', ask: 'Summarize this source in two sentences.', sources: ['checklists'] },
  { id: 'expert-resistance', surface: 'article:checklists', ask: 'Why do experts resist checklists, according to this?', sources: ['checklists'] },
  { id: 'before-the-story', surface: 'article:baseRates', ask: 'What does the author say to do before trusting a vivid story?', sources: ['baseRates'] },
  { id: 'calls-logged', surface: 'article:goodhart', ask: 'What happened when the team was paid on calls logged?', sources: ['goodhart'] },
  { id: 'define-margin', surface: 'article:marginOfSafety', ask: 'How does the author define a margin of safety?', sources: ['marginOfSafety'] },
  { id: 'connect-this', surface: 'article:checklists', ask: 'Connect this to anything else I have saved.', sources: ['checklists'], oneOf: ['premortem', 'marginOfSafety', 'reviewRituals'] },

  // Across the library: the old passage brought into the present question.
  { id: 'margin-and-checklists', surface: 'library', ask: 'How does margin of safety relate to the checklist piece I saved?', sources: ['marginOfSafety', 'checklists'] },
  { id: 'metrics-stop-working', surface: 'library', ask: 'What have I saved about why metrics stop working?', sources: ['goodhart'] },
  { id: 'procedure-protects', surface: 'think', ask: 'Which of my sources argue that a small procedure can protect judgment?', sources: ['checklists', 'premortem'], allowed: ['decisionHygiene', 'reviewRituals'] },
  { id: 'hiring', surface: 'think', ask: 'What have I written about hiring, and what in my reading bears on it?', sources: ['hiring'], oneOf: ['baseRates'] },
  { id: 'tired-decisions', surface: 'library', ask: 'Find what I saved about tired people making worse decisions.', sources: ['sleep'] },
  { id: 'imagined-failure', surface: 'library', ask: 'Is there anything in my library about imagining a project has already failed?', sources: ['premortem'] },
  { id: 'code-review-margin', surface: 'think', ask: 'What did I note in the margin about code review?', sources: ['checklists'] },
  { id: 'practice-and-writing', surface: 'think', ask: 'Connect deliberate practice to writing as a way of thinking.', sources: ['deliberatePractice', 'writing'] },
  { id: 'base-rate-skeptic', surface: 'library', ask: 'What would a skeptic of base rates say, and how do my sources answer it?', sources: ['baseRates'] },
  { id: 'incumbents', surface: 'library', ask: 'Why do big companies miss new markets?', sources: ['incumbents'] },
  { id: 'meeting-cost', surface: 'library', ask: 'What is the hidden cost of a one-hour meeting with eight people?', sources: ['meetings'] },
  { id: 'expertise-tension', surface: 'think', ask: 'Where do my sources disagree about how far expertise can be trusted?', sources: ['checklists', 'deliberatePractice'] },

  // Not in the library. Silence is the right answer.
  { id: 'french-revolution', surface: 'library', ask: 'What did I save about the French Revolution?', abstain: true },
  { id: 'mrna', surface: 'think', ask: 'What does my library say about mRNA vaccines?', abstain: true },
  { id: 'kubernetes', surface: 'think', ask: 'Summarize my notes on Kubernetes autoscaling.', abstain: true },
  { id: 'interest-rates', surface: 'article:checklists', ask: 'What does this source say about interest rates?', abstain: true }
]);

module.exports = { CASES };
