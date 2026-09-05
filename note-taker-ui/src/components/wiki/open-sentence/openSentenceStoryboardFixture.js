/*
 * Illustrative scene for the S1 storyboard. Not the live Parenting Wiki,
 * not a saved Nomad highlight, and not a private id.
 */

export const STORYBOARD_PAGE_TITLE = 'Parenting';

export const STORYBOARD_SENTENCE = 'Children need room to make mistakes.';

export const STORYBOARD_SOURCE = Object.freeze({
  title: 'Nomad',
  qualification: 'Saved passage · import date is not a reading date',
  aroundBefore: 'Getting lost was part of the work. The point was not to avoid every wrong turn.',
  passage: 'A wrong turn you can walk back from still teaches the map. The ones that strand you do not.',
  aroundAfter: 'That is a different kind of care than keeping someone from leaving the path at all.',
  available: true,
  stale: false
});

export const STORYBOARD_UNAVAILABLE_SOURCE = Object.freeze({
  title: 'Nomad',
  qualification: 'This source is unavailable',
  aroundBefore: '',
  passage: '',
  aroundAfter: '',
  available: false,
  stale: true
});

export const STORYBOARD_RETURN_NOTE = 'Next: figure out which mistakes are recoverable.';

export const STORYBOARD_PROVISIONAL = 'Children need room to make recoverable mistakes.';
