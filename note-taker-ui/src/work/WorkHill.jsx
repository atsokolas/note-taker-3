import React from 'react';

// The hill from Shape Up: figuring it out on the way up, making it happen on the way down.
// Dots sit on the same curve the line is drawn from, so a position is a point on the hill.
const rise = (at, height) => height - (height - 2) * Math.sin(Math.PI * at) ** 2;
const STEPS = 48;

export default function WorkHill({ dots, width, height, label, halves = false }) {
  const curve = Array.from({ length: STEPS + 1 }, (_, step) => `${(step / STEPS) * width},${rise(step / STEPS, height)}`).join(' ');
  const point = at => ({ cx: at * width, cy: rise(at, height) });
  return <svg className="work-hill" role="img" aria-label={label} width={width} height={height + (halves ? 28 : 4)} viewBox={`0 -2 ${width} ${height + (halves ? 28 : 4)}`}>
    {halves ? <><line className="work-hill-base" x1="0" x2={width} y1={height} y2={height} /><line className="work-hill-middle" x1={width / 2} x2={width / 2} y1="0" y2={height} /></> : null}
    <polyline className="work-hill-line" points={curve} />
    {halves ? <><text x={width / 4} y={height + 22}>Figuring it out</text><text x={(width * 3) / 4} y={height + 22}>Making it happen</text></> : null}
    {dots.map((dot, index) => { const { cx, cy } = point(dot.at), left = dot.at < 0.5, under = dots.slice(0, index).filter(other => Math.abs(other.at - dot.at) < 0.08).length; return <g key={dot.id} data-faint={dot.faint || undefined}>
      {(dot.was || []).map((at, index) => <circle key={index} className="work-hill-was" r="2" {...point(at)} />)}
      <circle className="work-hill-dot" r={halves ? 5 : 2.5} cx={cx} cy={cy} />
      {dot.name ? <text className="work-hill-name" x={cx + (left ? -10 : 10)} y={cy - 9 - 14 * under} textAnchor={left ? 'end' : 'start'}>{dot.name}</text> : null}
    </g>; })}
  </svg>;
}

export const hillPhrase = at => at === 0 ? 'Not started.' : at < 0.5 ? 'Still figuring it out.' : at < 1 ? 'Making it happen.' : 'Everything on it is done.';
