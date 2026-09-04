/**
 * What a concept is, and what a question is.
 *
 * Noeis has an opinion about both, and until now it only said so on the
 * first run. One concept in and the empty state was gone forever, so the
 * composer went back to asking "Describe what this concept is about" — which
 * is how a shelf ends up holding "ai", "agents" and "ai-capex" as three
 * separate ideas.
 *
 * The opinion, in one line each:
 *
 *   A concept is a lens, not a label. A label sorts things; a lens explains
 *   them. If you cannot say what it explains, it is a tag, and a tag belongs
 *   on a highlight rather than on a page of its own.
 *
 *   A question is an open loop, not a prompt. What makes it a question is
 *   that something could close it. If nothing could, it is a mood, and it
 *   will sit on the desk forever looking like work.
 *
 * Each room states its line under its own name, and each composer asks for
 * exactly the half the line promises — what it explains, what would settle
 * it — so the definition and the field agree.
 */

export const CONCEPT_DEFINITION = 'An idea your reading keeps returning to — and what it explains.';

export const QUESTION_DEFINITION = 'An open loop you are still carrying — and what would settle it.';

/* The composer asks the second half of the definition, because the first
   half is the name you already typed. */
export const CONCEPT_EXPLAINS_LABEL = 'What does it explain?';

export const CONCEPT_EXPLAINS_PLACEHOLDER = 'The thing this lens lets you see — "how people actually decide what to buy"';

export const QUESTION_SETTLES_LABEL = 'What would settle this?';

export const QUESTION_SETTLES_PLACEHOLDER = 'The observation that would close the loop — "two quarters of guidance in the same direction"';

/* An unanswered half is a gap, and a gap is said out loud. Silence here
   would read as "nothing to add" when it means "nobody has said yet". */
export const QUESTION_UNSETTLED_NOTE = 'Nothing named yet that would settle this.';

export const CONCEPT_UNEXPLAINED_NOTE = 'Nothing named yet that this explains.';
