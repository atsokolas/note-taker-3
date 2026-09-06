/*
 * Illustrative scene for the storyboard. Not the live Parenting Wiki,
 * not a saved Nomad highlight, and not a private id.
 */

export const STORYBOARD_COMPUTE_ID = 'compute-will-remain-scarce';

export const STORYBOARD_COMPUTE_TITLE = 'Compute will remain scarce';

export const STORYBOARD_COMPUTE_SENTENCE = 'Compute will remain scarce.';

export const STORYBOARD_THEN_NOW = 'Software can do more with the same plant.';

export const STORYBOARD_THEN_QUOTATION = 'The plant, not the algorithm, was the limit.';

export const STORYBOARD_PREMISE = 'demand grows more slowly';

export const STORYBOARD_COMPUTE_SOURCE = Object.freeze({
  title: 'Capacity',
  qualification: 'Saved passage · import date is not a reading date',
  aroundBefore: 'The bottleneck was not a clever algorithm. It was the physical plant.',
  passage: 'Supply was the constraint this decade.',
  aroundAfter: 'That does not prove the next decade will look the same.',
  available: true,
  stale: false,
  href: '',
  here: false
});

export const STORYBOARD_PAGE_TITLE = 'Parenting';

export const STORYBOARD_SENTENCE = 'Children need room to make mistakes.';

export const STORYBOARD_SCOPE = 'storyboard';

export const STORYBOARD_ITEM_ID = 'parenting-room-to-be-wrong';

export const STORYBOARD_SOURCE_ROOMS = Object.freeze([
  { id: 'illustrated', label: 'Nomad' },
  { id: 'none', label: 'Silence' },
  { id: 'unavailable', label: 'Gone' },
  { id: 'bare', label: 'No around' },
  { id: 'stale', label: 'Older copy' },
  { id: 'long', label: 'Long passage' }
]);

export const STORYBOARD_SOURCE = Object.freeze({
  title: 'Nomad',
  qualification: 'Saved passage · import date is not a reading date',
  aroundBefore: 'Getting lost was part of the work. The point was not to avoid every wrong turn.',
  passage: 'A wrong turn you can walk back from still teaches the map. The ones that strand you do not.',
  aroundAfter: 'That is a different kind of care than keeping someone from leaving the path at all.',
  available: true,
  stale: false,
  href: '/library?articleId=illustrated-nomad&highlightId=illustrated-wrong-turn',
  isLibrary: true,
  here: false,
  articleId: 'illustrated-nomad',
  highlightId: 'illustrated-wrong-turn'
});

export const STORYBOARD_LIBRARY_SOURCE = Object.freeze({
  ...STORYBOARD_SOURCE,
  href: '',
  here: true,
  qualification: 'Saved passage · already here'
});

export const STORYBOARD_UNAVAILABLE_SOURCE = Object.freeze({
  title: 'Nomad',
  qualification: '',
  aroundBefore: '',
  passage: '',
  aroundAfter: '',
  available: false,
  stale: true
});

export const STORYBOARD_BARE_SOURCE = Object.freeze({
  ...STORYBOARD_SOURCE,
  aroundBefore: '',
  aroundAfter: ''
});

export const STORYBOARD_STALE_SOURCE = Object.freeze({
  ...STORYBOARD_SOURCE,
  stale: true,
  qualification: 'Saved passage · an older copy of Nomad'
});

export const STORYBOARD_LONG_SOURCE = Object.freeze({
  ...STORYBOARD_SOURCE,
  aroundBefore: 'Getting lost was part of the work. The point was not to avoid every wrong turn. Maps that never leave the table do not teach the ground.',
  passage: [
    'A wrong turn you can walk back from still teaches the map. The ones that strand you do not.',
    'The distinction is practical, not moral. You learn the shape of a place by leaving a path and finding it again.',
    'A guide who forbids every departure also forbids the knowledge that would make the next departure safer.',
    'That is a different kind of care than keeping someone from leaving the path at all.',
    'The useful question is not whether a mistake happened. It is whether the person can continue, and whether the map is more true than it was this morning.'
  ].join(' ')
});

export const storyboardSource = (mode) => {
  switch (mode) {
    case 'none':
      return null;
    case 'unavailable':
      return STORYBOARD_UNAVAILABLE_SOURCE;
    case 'bare':
      return STORYBOARD_BARE_SOURCE;
    case 'stale':
      return STORYBOARD_STALE_SOURCE;
    case 'long':
      return STORYBOARD_LONG_SOURCE;
    default:
      return STORYBOARD_SOURCE;
  }
};

export const STORYBOARD_RETURN_NOTE = 'Next: figure out which mistakes are recoverable.';

export const STORYBOARD_PROVISIONAL = 'Children need room to make recoverable mistakes.';
