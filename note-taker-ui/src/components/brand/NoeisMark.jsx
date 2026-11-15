import React from 'react';
import mark from '../../assets/noeis-mark.svg';

export default function NoeisMark({ size = 24 }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: size, height: size, flexShrink: 0,
      background: 'currentColor', mask: `url(${mark}) center / contain no-repeat`,
      WebkitMask: `url(${mark}) center / contain no-repeat`,
    }} />
  );
}
