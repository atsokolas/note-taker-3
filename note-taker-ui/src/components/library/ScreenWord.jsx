import React from 'react';
import { handOffSentence } from '../../motion/columnMotion';
import { PLACES } from '../../motion/crossings';
import { screenWordLabel } from '../../pages/feedModel';

const ScreenWord = ({ asFeed = false, sentence = '', onScreen }) => {
  if (!onScreen) return null;
  return (
    <button
      type="button"
      className="library-screen-word"
      onClick={(event) => {
        /* Screening carries the folder's name onto the rail: a scroll
           arriving on the desk, which is a crossing. */
        if (!asFeed && sentence) {
          handOffSentence(sentence, event.currentTarget, { from: PLACES.IMBOX, to: PLACES.SCROLL });
        }
        onScreen(!asFeed);
      }}
    >
      {screenWordLabel(asFeed)}
    </button>
  );
};

export default ScreenWord;
