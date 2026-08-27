import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const periodLabel = ({ startsAt, endsAt } = {}) => {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'This fortnight';
  return `${monthDay.format(start)}–${monthDay.format(end)}`;
};

const positionOf = (shares = [], index = 0) => {
  const peak = Math.max(...shares, 0.0001);
  const x = shares.length > 1 ? index * (WIDTH / (shares.length - 1)) : 0;
  const y = HEIGHT - ((shares[index] || 0) / peak) * HEIGHT;
  return { left: `${x}%`, top: `${y}px` };
};

const workByline = (work = {}) => work.author || work.publication || '';

const annotationAlignment = (index, length) => {
  if (index < 2) return 'start';
  if (index >= length - 2) return 'end';
  return 'center';
};

const ReadingDrift = ({ articles = [], loading = false, unreadable = false, now }) => {
  const [activePoint, setActivePoint] = useState(null);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const exitTimer = useRef(null);
  const drift = useMemo(
    () => withDirections(buildDrift(articles, now)),
    [articles, now]
  );

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const showPoint = point => {
    clearTimeout(exitTimer.current);
    setActivePoint(point);
    setAnnotationOpen(true);
  };

  const hidePoint = topic => {
    if (activePoint?.topic !== topic) return;
    clearTimeout(exitTimer.current);
    setAnnotationOpen(false);
    exitTimer.current = setTimeout(() => {
      setActivePoint(current => current?.topic === topic ? null : current);
    }, 260);
  };
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
          {drift.series.map(item => {
            const active = activePoint?.topic === item.topic
              ? item.periods[activePoint.index]
              : null;
            const peak = item.shares.indexOf(Math.max(...item.shares));
            const annotationId = active ? `drift-note-${item.topic.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${activePoint.index}` : undefined;
            const anchor = active ? positionOf(item.shares, activePoint.index) : null;
            const alignment = active ? annotationAlignment(activePoint.index, item.periods.length) : 'center';
            return (
              <li
                key={item.topic}
                className={`drift__row${active ? ' has-annotation' : ''}${active && annotationOpen ? ' is-reading' : ''}`}
                data-direction={item.direction}
                onMouseLeave={() => hidePoint(item.topic)}
              >
                <span className="drift__topic">{item.topic}</span>
                <div className="drift__plot">
                  <svg
                    className="drift__line"
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`${item.topic}: ${DIRECTION_WORD[item.direction]}, ${item.total} source${item.total === 1 ? '' : 's'} over three months`}
                  >
                    <path d={path(item.shares)} vectorEffect="non-scaling-stroke" />
                  </svg>
                  {item.periods.map((period, index) => period.count ? (
                    <button
                      key={period.startsAt}
                      type="button"
                      className={`drift__point${index === peak ? ' is-peak' : ''}${activePoint?.topic === item.topic && activePoint.index === index ? ' is-active' : ''}`}
                      style={positionOf(item.shares, index)}
                      aria-label={`${item.topic}, ${periodLabel(period)}: ${period.count} of ${period.total} filed sources`}
                      aria-describedby={activePoint?.topic === item.topic && activePoint.index === index ? annotationId : undefined}
                      onMouseEnter={() => showPoint({ topic: item.topic, index })}
                      onFocus={() => showPoint({ topic: item.topic, index })}
                      onBlur={() => hidePoint(item.topic)}
                      onClick={() => showPoint({ topic: item.topic, index })}
                    >
                      <span aria-hidden="true" />
                    </button>
                  ) : null)}
                  <aside
                    id={annotationId}
                    className={`drift__annotation is-${alignment}`}
                    style={anchor ? {
                      '--drift-anchor-x': anchor.left,
                      '--drift-anchor-y': anchor.top
                    } : undefined}
                    aria-hidden={!(active && annotationOpen)}
                  >
                    {active ? (
                      <>
                        <div className="drift__annotation-head">
                          <div>
                            <span className="drift__annotation-period">{periodLabel(active)}</span>
                            <strong>{item.topic}</strong>
                          </div>
                          <span className="drift__annotation-share">
                            {active.count} of {active.total}
                            <small>filed sources</small>
                          </span>
                        </div>
                        <ol className="drift__works">
                          {active.works.slice(0, 4).map((work, index) => (
                            <li key={work.id || `${work.title}-${index}`}>
                              <span>{work.title}</span>
                              {workByline(work) ? <small>{workByline(work)}</small> : null}
                            </li>
                          ))}
                        </ol>
                        {active.works.length > 4 ? (
                          <p className="drift__more">+ {active.works.length - 4} more in this fortnight</p>
                        ) : null}
                      </>
                    ) : null}
                  </aside>
                </div>
                <span className="drift__direction">{DIRECTION_WORD[item.direction]}</span>
              </li>
            );
          })}
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
