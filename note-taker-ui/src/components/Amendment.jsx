import React from 'react';

export default function Amendment({ before, after, beforeLabel = 'Previous wording', afterLabel = 'Revised wording', children }) {
  return (
    <div className="reading-amendment">
      <dl>
        <div><dt>{beforeLabel}</dt><dd>{before}</dd></div>
        <div><dt>{afterLabel}</dt><dd>{after}</dd></div>
      </dl>
      {children}
    </div>
  );
}
