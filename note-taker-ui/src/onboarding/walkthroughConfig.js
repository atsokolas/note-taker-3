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
    detail: 'Saved articles, highlights, and notes stay attached to where they came from.',
    detailWithMaterial: ({ sourceCount }) => (
      `The ${sourceCount === 1 ? 'source' : 'sources'} I just read for your page ${sourceCount === 1 ? 'is' : 'are'} in here — attached to where they came from.`
    )
  },
  {
    id: 'think',
    route: '/think?tab=concepts',
    eyebrow: 'Think',
    title: 'This is where reading turns into your own thinking.',
    detail: 'Concepts, open questions, and notes build on the sources underneath them.'
  },
  {
    id: 'home',
    // A real surface, never a redirect. '/paper' did not exist on main and left a
    // new user on a blank screen; '/' only redirects here, and this panel's own
    // navigation effect raced that redirect and pinned them at a blank '/' instead.
    // Both were found on production signups. When home moves, change this line.
    route: '/wiki',
    eyebrow: 'Home',
    title: 'This is home.',
    detail: 'Come back here and Noeis shows what changed in your reading and what is worth returning to. It fills in as you feed it.'
  }
];

// Connections is deliberately not a stop.
//
// The extension ask already happens on the last onboarding screen, where the user
// can act on it without leaving. Walking them back to Connections showed the same
// card a second time and spent a stop on a settings page, which is the least
// interesting surface in the product and the one furthest from their own material.


export const WALKTHROUGH_STOP_IDS = WALKTHROUGH_STOPS.map(stop => stop.id);

// Session-scoped: a walkthrough is tied to one build, and a stale one resuming days
// later would be nonsense.
export const WALKTHROUGH_STATE_KEY = 'noeis.onboarding.walkthrough.v1';
