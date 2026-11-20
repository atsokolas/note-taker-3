import React from 'react';

export default function Amendment({ before, after, children }) {
  return (
    <div className="reading-amendment">
      <dl>
        <div><dt>Previous wording</dt><dd>{before}</dd></div>
        <div><dt>Revised wording</dt><dd>{after}</dd></div>
      </dl>
      {children}
    </div>
  );
}
