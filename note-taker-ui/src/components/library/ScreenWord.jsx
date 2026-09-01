import React from 'react';
import { screenWordLabel } from '../../pages/feedModel';

const ScreenWord = ({ asFeed = false, onScreen }) => {
  if (!onScreen) return null;
  return (
    <button
      type="button"
      className="library-screen-word"
      onClick={() => onScreen(!asFeed)}
    >
      {screenWordLabel(asFeed)}
    </button>
  );
};

export default ScreenWord;
