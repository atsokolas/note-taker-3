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
    detail: 'Everything you save keeps its source attached, so anything built on it can be traced back.',
    detailWithMaterial: ({ sourceCount }) => (
      `The ${sourceCount === 1 ? 'source you just added is' : 'sources you just added are'} in here, with ${sourceCount === 1 ? 'its' : 'their'} origin attached.`
    )
  },
  {
    id: 'think',
    route: '/think?tab=concepts',
    eyebrow: 'Think',
    title: 'This is where reading turns into your own thinking.',
    // Empty on day one, and the copy has to survive that: say what will fill the
    // room rather than describing contents this user does not have.
    detail: 'It is empty until you write in it. Concepts, open questions, and notes start from what you have saved, and keep pointing back at it.'
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
    // Also empty on day one. A wiki page is something the user builds once there is
    // material worth building from, so this promises the condition, not a page —
    // and names the control that does it. The previous copy said a page gets built
    // here without saying by what, which leaves the one action the user is supposed
    // to take as the one thing the walkthrough never points at.
    detail: 'Nothing here yet — you build the pages. Once you have gathered enough reading, ask for a wiki page below and Noeis writes it from what you saved. This is also where it tells you what changed while you were away.'
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
