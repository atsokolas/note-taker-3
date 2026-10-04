import React from 'react';
import './shareDestinations.css';

// Only mounted after the owner has created a public link. Never send private
// excerpts, reading activity, or an unshared draft to a destination.
const ShareDestinations = ({ url, title = 'Shared from Noeis' }) => {
  if (!url) return null;
  const subject = String(title || 'Shared from Noeis');
  const email = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${subject}\n\n${url}`)}`;
  const x = `https://twitter.com/intent/tweet?${new URLSearchParams({ url })}`;
  return (
    <>
      <a className="share-destination" href={email} aria-label="Share via email">Email</a>
      <a className="share-destination" href={x} target="_blank" rel="noopener noreferrer" aria-label="Share on X">X</a>
    </>
  );
};

export default ShareDestinations;
