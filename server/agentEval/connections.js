/* The connections eval: a small library with known answers to "what did
   this source add?". Each new source names the passages it should echo, the
   questions it should answer and the wiki pages it belongs on; a source on
   nothing the reader holds should add nothing. Run by
   scripts/run_connections_eval.js against the configured embedding model,
   with the vector index replaced by exact cosine over the same vectors, so
   what it scores is the floors and the rules, not Atlas. */

const id = (n) => `64c0000000000000000${String(n).padStart(5, '0')}`;

const HELD = [
  { n: 1, work: 'The Checklist Manifesto', text: 'Under conditions of complexity, not only are checklists a help, they are required for success. There must always be room for judgment, but judgment aided and even enhanced by procedure.' },
  { n: 2, work: 'The Checklist Manifesto', text: 'The volume and complexity of what we know has exceeded our individual ability to deliver its benefits correctly, safely, or reliably.' },
  { n: 3, work: 'Superforecasting', text: 'Superforecasters start with the outside view: how often things of this sort happen in situations of this sort, before they look at what makes this case special.' },
  { n: 4, work: 'Superforecasting', text: 'Beliefs are hypotheses to be tested, not treasures to be guarded, and the best forecasters update in small steps as each piece of news arrives.' },
  { n: 5, work: 'The Power Broker', text: 'Moses built the parkway overpasses so low that buses could not pass beneath them, and so the parks stayed out of reach of anyone who did not own a car.' },
  { n: 6, work: 'Seven Powers', text: 'Power is the set of conditions creating the potential for persistent differential returns: a benefit to the business and a barrier that keeps rivals from competing it away.' },
  { n: 7, work: 'Why We Sleep', text: 'Routinely sleeping less than six or seven hours a night demolishes the immune system and more than doubles the risk of cancer.' },
  { n: 8, work: 'Thinking, Fast and Slow', text: 'When faced with a difficult question, we often answer an easier one instead, usually without noticing the substitution.' },
  { n: 9, work: 'Range', text: 'In wicked learning environments, where feedback is delayed or misleading, experience does not reliably produce expertise.' },
  // Distractors: close in words to something below, far in thought.
  { n: 10, work: 'Salt Fat Acid Heat', text: 'Salt has a greater impact on flavor than any other ingredient; learn to use it well and your food will taste good.' },
  { n: 11, work: 'The Art of Gathering', text: 'A gathering needs a purpose that is specific and disputable, or the host ends up defaulting to the format everyone already knows.' }
];

const QUESTIONS = [
  { n: 20, text: 'When do procedures beat expert judgment?' },
  { n: 21, text: 'How should I estimate how likely a new project is to succeed?' },
  { n: 22, text: 'What makes a company\'s advantage last?' }
];

// A question typed beside a book: a line of your own, ending in "?".
const BOOK_QUESTIONS = [
  { n: 30, work: 'Range', note: 'Can you become an expert where feedback comes late?' }
];

const PAGES = [
  { n: 40, title: 'Infrastructure and power', claims: ['Roads and bridges encode political choices about who gets to go where.'] },
  { n: 41, title: 'Sleep', claims: ['Short sleep damages health in ways people do not notice until much later.'] }
];

// What arrives, the passages you marked in it, and what it should add, by kind and held number.
const SOURCES = [
  {
    id: 'surgery-checklist',
    title: 'What the WHO surgical checklist changed',
    marks: ['After hospitals adopted a nineteen-item checklist, major complications fell by more than a third, even among surgeons who believed they did not need it.'],
    expects: { echo: [1], answers: [20] }
  },
  {
    id: 'base-rates',
    title: 'Reference class forecasting for megaprojects',
    marks: ['To predict a project\'s cost, ignore its specifics at first and ask how comparable projects turned out; most planners skip this and are wildly optimistic.'],
    expects: { echo: [3], answers: [21] }
  },
  {
    id: 'moats',
    title: 'Network effects are not enough',
    marks: ['A network effect only protects a business if a rival cannot replicate the network; otherwise the advantage is competed away within a few years.'],
    expects: { echo: [6], answers: [22] }
  },
  {
    id: 'highways',
    title: 'How interstates split American cities',
    marks: ['Planners routed the new highways straight through Black neighborhoods, a decision about who mattered that is still poured into the concrete.'],
    expects: { echo: [5], belongs: [40] }
  },
  {
    id: 'chess-and-tennis',
    title: 'Kind and wicked learning environments',
    marks: ['Golf and chess reward repetition because the feedback is fast and accurate; most of work is not like that, and practice there can teach the wrong lessons.'],
    expects: { echo: [9], answers: [30] }
  },
  {
    id: 'sleep-debt',
    title: 'The hidden cost of six hours',
    marks: ['People restricted to six hours of sleep for two weeks performed as badly as those kept awake for two nights, yet rated themselves as only slightly impaired.'],
    expects: { echo: [7], belongs: [41] }
  },
  {
    // Shares words with the salt distractor and nothing else: should add nothing.
    id: 'bread',
    title: 'A beginner\'s sourdough',
    marks: ['Feed the starter twice a day, keep it warm, and bake when it doubles in four to six hours.'],
    expects: {}
  }
];

module.exports = { id, HELD, QUESTIONS, BOOK_QUESTIONS, PAGES, SOURCES };
