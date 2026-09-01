import React from 'react';
import { handOffSentence } from '../../motion/columnMotion';
import { screenWordLabel } from '../../pages/feedModel';

const ScreenWord = ({ asFeed = false, sentence = '', onScreen }) => {
  if (!onScreen) return null;
  return (
    <button
      type="button"
      className="library-screen-word"
      onClick={(event) => {
        if (!asFeed && sentence) handOffSentence(sentence, event.currentTarget);
        onScreen(!asFeed);
      }}
    >
      {screenWordLabel(asFeed)}
    </button>
  );
};

export default ScreenWord;
