import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMorningPaperColumns } from '../../api/wiki';
import {
  anniversaryLine,
  calibrationLine,
  firstWeekLine,
  oldestOpenLine,
  askedLine,
  closingGroups,
  correctionLines,
  disagreementLine,
  obituaryLine,
  paperWeight,
  quietMorning,
  quietStreakLine,
  rightForWrongReasonsLine,
  warnedLine
} from '../../pages/paperColumnsModel';

/**
 * The four things only this product can print.
 *
 * The front page used to be a maintenance grid — sixty rows where two phrases
 * repeated down a column — and the one genuinely interesting line on it was
 * set in fine print underneath. These are the columns a paper runs: a belief
 * you have not looked at in a year, your own sources caught arguing, a
 * reversal you made, and the page that has gone longest without a word.
 *
 * Every one of them is absent when there is nothing true to say. That is
 * deliberate and it is the whole feature: the length of the paper tells you
 * what kind of day it is before you read a word, and a morning with nothing
 * in it says so and lets you go.
 */

const Column = ({ standfirst, children, footnote, asked = '', href, className = '' }) => (
  <section className={`paper-column ${className}`.trim()}>
    <p className="paper-column__standfirst">{standfirst}</p>
    {href ? <Link className="paper-column__body" to={href}>{children}</Link> : <p className="paper-column__body">{children}</p>}
    {footnote ? <p className="paper-column__footnote">{footnote}</p> : null}
    {/* Showing a thing a fourth time is a re-read. Saying it is the fourth
        time is a confrontation, and it is the whole reason the paper keeps a
        record of itself. */}
    {asked ? <p className="paper-column__asked">{asked}</p> : null}
  </section>
);

const PaperColumns = ({ weekend = false }) => {
  const [columns, setColumns] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMorningPaperColumns({ weekend })
      .then((found) => { if (!cancelled) setColumns(found); })
      /* A column that could not be fetched is not a quiet morning. Say
         nothing rather than claim the day was empty. */
      .catch(() => { if (!cancelled) setColumns({ failed: true }); })
    ;
    return () => { cancelled = true; };
  }, [weekend]);

  if (!columns || columns.failed) return null;

  const anniversary = anniversaryLine(columns.anniversary);
  const disagreement = disagreementLine(columns.disagreement);
  const corrections = correctionLines(columns.corrections);
  const obituary = obituaryLine(columns.obituary);
  const warned = warnedLine(columns.warned);
  const calibration = calibrationLine(columns.calibration);
  const firstWeek = firstWeekLine(columns.firstWeek);
  const oldest = oldestOpenLine(columns.oldestOpen);
  const wrongReasons = rightForWrongReasonsLine(columns.rightForWrongReasons);
  const streak = quietStreakLine(columns.streak);
  const asked = askedLine(columns.asked);
  const { answered, corrections: paperCorrections } = closingGroups(columns.closed);

  /* The best sentence this product can print, and the only one none of its
     competitors would dare: there is nothing here, go away. */
  if (!paperWeight(columns)) {
    return (
      <p className="paper-column__quiet">
        {/* On a weekend it names the day, because "it's Saturday" is a reason
            where "a quiet morning" is only a report. */}
        {quietMorning({ weekend })}
        {/* One quiet day is rest. A run of them is news, and only a paper
            that remembers its own mornings can tell the difference. */}
        {streak ? <span className="paper-column__streak">{streak}</span> : null}
      </p>
    );
  }

  return (
    <div className="paper-columns" data-testid="paper-columns">
      {/* It leads. A falsifier a watcher matched outranks a year-old belief,
          and outranks everything else on the page. */}
      {warned ? (
        <Column
          className="paper-column--warned"
          standfirst={warned.standfirst}
          footnote={warned.footnote}
          href={warned.href}
        >
          “{warned.text}”
        </Column>
      ) : null}

      {anniversary ? (
        <Column
          className="paper-column--anniversary"
          standfirst={anniversary.standfirst}
          footnote={anniversary.footnote}
          asked={asked}
          href={anniversary.href}
        >
          “{anniversary.text}”
        </Column>
      ) : null}

      {disagreement ? (
        <Column
          className="paper-column--disagreement"
          standfirst={disagreement.standfirst}
          footnote={disagreement.footnote}
          href={disagreement.href}
        >
          “{disagreement.text}”
        </Column>
      ) : null}

      {/* Not a correction. This is the reader changing position, read out of a
          claim's own history — it was called Correction before the paper kept
          a record, when there was nothing else the word could have meant. */}
      {corrections.length ? (
        <section className="paper-column paper-column--corrections">
          <p className="paper-column__standfirst">Second thoughts</p>
          <ul className="paper-column__corrections">
            {corrections.map(correction => (
              <li key={correction.key}>
                {correction.href ? (
                  <Link to={correction.href}>{correction.claim}</Link>
                ) : (
                  <span>{correction.claim}</span>
                )}
                <span className="paper-column__correction-note">{correction.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* What the paper asked about and you have since dealt with. The loop
          closing, which is the other half of keeping a record — a paper that
          notices you acted is a different object from one that asks again. */}
      {answered.length ? (
        <section className="paper-column paper-column--closed">
          <p className="paper-column__standfirst">Since we last asked</p>
          <ul className="paper-column__closings">
            {answered.map(entry => (
              <li key={entry.key}>
                {entry.href ? <Link to={entry.href}>{entry.text}</Link> : <span>{entry.text}</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The word used properly, at last: we printed a thing and the thing was
          not there. A paper that quietly drops a question it can no longer
          answer is hoping nobody remembers it asked. */}
      {paperCorrections.length ? (
        <section className="paper-column paper-column--correction">
          <p className="paper-column__standfirst">
            {paperCorrections.length === 1 ? 'Correction' : 'Corrections'}
          </p>
          <ul className="paper-column__closings">
            {paperCorrections.map(entry => <li key={entry.key}><span>{entry.text}</span></li>)}
          </ul>
        </section>
      ) : null}

      {/* The verdict nothing has ever printed. Said once, deadpan. */}
      {wrongReasons ? (
        <section className="paper-column paper-column--wrong-reasons">
          <p className="paper-column__standfirst">Right, for the wrong reasons</p>
          {wrongReasons.href ? (
            <Link className="paper-column__body" to={wrongReasons.href}>“{wrongReasons.claim}”</Link>
          ) : <p className="paper-column__body">“{wrongReasons.claim}”</p>}
          <p className="paper-column__footnote">{wrongReasons.text}</p>
        </section>
      ) : null}

      {/* A superlative, and a useful one — the oldest open question is
          usually the one being avoided. */}
      {oldest ? (
        <p className="paper-column__oldest">
          {oldest.href ? <Link to={oldest.href}>{oldest.text}</Link> : oldest.text}
        </p>
      ) : null}

      {/* For a reader three days old, the only thing that can be said. It
          stops once the year-scale columns can speak for themselves. */}
      {firstWeek ? (
        <section className="paper-column paper-column--first-week">
          <p className="paper-column__standfirst">Your first week</p>
          <p className="paper-column__body">{firstWeek.text}</p>
          {firstWeek.hint ? (
            <p className="paper-column__footnote">
              <Link to={firstWeek.href}>{firstWeek.hint}</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Last, and quiet. It is the one line about the reader rather than
          about the corpus, and it is not news — it is a standing fact that
          happens to be true this morning. */}
      {calibration ? (
        <p className="paper-column__calibration">
          <Link to={calibration.href}>{calibration.text}</Link>
        </p>
      ) : null}

      {obituary ? (
        <p className="paper-column__obituary">
          {obituary.href ? <Link to={obituary.href}>{obituary.text}</Link> : obituary.text}
        </p>
      ) : null}
    </div>
  );
};

export default PaperColumns;
