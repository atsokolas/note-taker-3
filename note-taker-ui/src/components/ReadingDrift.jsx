import React, { useMemo } from 'react';
import { buildDrift, driftSentence, driftShortfall, withDirections } from '../pages/readingDriftModel';
import '../styles/reading-drift.css';

/*
 * Where your reading is going.
 *
 * The one thing in this product that asks nothing of you. No decision, no
 * count of what you owe — you look at it the way you look at a year of your
 * own handwriting.
 *
 * Drawn as a newspaper would draw it: one line per topic, ink on cream, no
 * axes and no legend, because the labels are the legend. The height of each
 * mark is that topic's share of what you filed that fortnight, and the whole
 * thing is decoration only in the sense that a masthead is.
 */

const WIDTH = 100;
const HEIGHT = 30;

const path = (shares = []) => {
  if (shares.length < 2) return '';
  const step = WIDTH / (shares.length - 1);
  /* The tallest share in this row becomes the top of it, so a topic that never
     rises above a tenth is still readable rather than a flat line at the foot. */
  const peak = Math.max(...shares, 0.0001);
  return shares
    .map((share, index) => {
      const x = index * step;
      const y = HEIGHT - (share / peak) * HEIGHT;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

const DIRECTION_WORD = {
  rising: 'rising',
  fading: 'fading',
  steady: 'steady'
};

const ReadingDrift = ({ articles = [], loading = false, unreadable = false, now }) => {
  const drift = useMemo(
    () => withDirections(buildDrift(articles, now)),
    [articles, now]
  );
  const sentence = unreadable || loading ? '' : driftSentence(drift);
  /* "You have not filed enough" and "your library could not be read" look
     identical from here and are completely different things to be told. The
     first is about you; the second is about the server, and saying the first
     when the second is true is the software blaming the reader for its own
     outage. */
  const shortfall = loading
    /* Before the reading arrives there is nothing to say about it. Saying
       "this fills in as you file" during those seconds tells a reader with
       three hundred filed sources that they have filed nothing. */
    ? 'Reading back the last three months…'
    : unreadable
      ? 'Your library could not be read just now, so there is nothing to draw. This is not about your filing.'
      : driftShortfall(drift);

  return (
    <section className="drift" aria-labelledby="drift-title">
      <h2 id="drift-title">Where your reading is going</h2>

      {sentence ? <p className="drift__sentence">{sentence}</p> : null}
      {shortfall ? <p className="drift__shortfall">{shortfall}</p> : null}

      {drift.enough && !unreadable && !loading ? (
        <ol className="drift__rows">
          {drift.series.map(item => (
            <li key={item.topic} className="drift__row" data-direction={item.direction}>
              <span className="drift__topic">{item.topic}</span>
              <svg
                className="drift__line"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${item.topic}: ${DIRECTION_WORD[item.direction]}, ${item.total} source${item.total === 1 ? '' : 's'} over three months`}
              >
                <path d={path(item.shares)} vectorEffect="non-scaling-stroke" />
              </svg>
              <span className="drift__direction">{DIRECTION_WORD[item.direction]}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {drift.enough && !unreadable && !loading ? (
        <p className="drift__scale" aria-hidden="true">
          three months ago<span>·</span>now
        </p>
      ) : null}
    </section>
  );
};

export default ReadingDrift;
