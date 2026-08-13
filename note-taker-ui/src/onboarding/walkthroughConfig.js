/**
 * The first-run walkthrough.
 *
 * This runs *while the user's first page is building*, which is the only reason it
 * earns its place: the build takes about ten seconds of real work, the user is not
 * waiting on it, and the alternative is dead air. It replaces the old five-step
 * product tour, which ran over an empty product and taught nothing.
 *
 * Rules encoded here:
 *  - Every stop is about the user's own material, not the UI. A stop that would
 *    only say "this is the Library" is not worth a stop.
 *  - Home is the Paper. The walkthrough ends there, because that is where the user
 *    comes back to — and arriving with it explained beats landing on it cold.
 *  - Short. Four stops, skippable at every one. The build is the payoff, not this.
 */

export const WALKTHROUGH_STOPS = [
  {
    id: 'library',
    route: '/library',
    eyebrow: 'Your library',
    title: 'Everything you keep lands here.',
    // Filled with the user's real counts at render time; falls back to the plain
    // sentence when there is nothing true to say yet.
    detail: 'Saved articles, highlights, and notes stay attached to where they came from.',
    detailWithMaterial: ({ sourceCount }) => (
      `The ${sourceCount === 1 ? 'source' : 'sources'} I just read for your page ${sourceCount === 1 ? 'is' : 'are'} in here — attached to where they came from.`
    )
  },
  {
    id: 'capture',
    route: '/connections#capture',
    eyebrow: 'Capture',
    title: 'I only get sharper if things reach me.',
    // No embedded card: this stop navigates to the capture card on Connections, and
    // showing a second copy in the panel just doubles the same ask.
    detail: 'The card below is the one ask. Everything else can wait.'
  },
  {
    id: 'think',
    route: '/think?tab=concepts',
    eyebrow: 'Think',
    title: 'This is where reading turns into your own thinking.',
    detail: 'Concepts, open questions, and notes build on the sources underneath them.'
  },
  {
    id: 'paper',
    route: '/paper',
    eyebrow: 'Home',
    title: 'The Paper is home.',
    detail: 'Each morning it shows what changed in your reading and what is worth returning to. It fills in as you feed it.'
  }
];

export const WALKTHROUGH_STOP_IDS = WALKTHROUGH_STOPS.map(stop => stop.id);

// Session-scoped: a walkthrough is tied to one build, and a stale one resuming days
// later would be nonsense.
export const WALKTHROUGH_STATE_KEY = 'noeis.onboarding.walkthrough.v1';
