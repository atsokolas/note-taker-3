import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMorningPaperColumns } from '../../api/wiki';
import {
  QUIET_MORNING,
  anniversaryLine,
  askedLine,
  closingLines,
  correctionLines,
  disagreementLine,
  obituaryLine,
  paperWeight
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

const PaperColumns = () => {
  const [columns, setColumns] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMorningPaperColumns()
      .then((found) => { if (!cancelled) setColumns(found); })
      /* A column that could not be fetched is not a quiet morning. Say
         nothing rather than claim the day was empty. */
      .catch(() => { if (!cancelled) setColumns({ failed: true }); })
    ;
    return () => { cancelled = true; };
  }, []);

  if (!columns || columns.failed) return null;

  const anniversary = anniversaryLine(columns.anniversary);
  const disagreement = disagreementLine(columns.disagreement);
  const corrections = correctionLines(columns.corrections);
  const obituary = obituaryLine(columns.obituary);
  const asked = askedLine(columns.asked);
  const closed = closingLines(columns.closed);

  /* The best sentence this product can print, and the only one none of its
     competitors would dare: there is nothing here, go away. */
  if (!paperWeight(columns)) {
    return <p className="paper-column__quiet">{QUIET_MORNING}</p>;
  }

  return (
    <div className="paper-columns" data-testid="paper-columns">
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

      {corrections.length ? (
        <section className="paper-column paper-column--corrections">
          <p className="paper-column__standfirst">
            {corrections.length === 1 ? 'Correction' : 'Corrections'}
          </p>
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
      {closed.length ? (
        <section className="paper-column paper-column--closed">
          <p className="paper-column__standfirst">Since we last asked</p>
          <ul className="paper-column__closings">
            {closed.map(entry => (
              <li key={entry.key}>
                {entry.href ? <Link to={entry.href}>{entry.text}</Link> : <span>{entry.text}</span>}
              </li>
            ))}
          </ul>
        </section>
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
