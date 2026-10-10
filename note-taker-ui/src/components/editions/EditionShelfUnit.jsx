import React from 'react';
import AgentMark from './AgentMark';
import { handOf } from './editionAgent';
import { issueLine, sectionTones, shelfGrid } from '../../pages/editionModel';

const names = agents => agents.map(agent => agent.name).join(' and ');

/* What a bay says to someone who cannot see it. */
const bayLabel = (row, section, cell, issueLabel) => {
  const issue = issueLine({ issueLabel, number: row.number }) || row.label;
  const said = {
    filled: `${cell.count} filed${cell.foreign.length ? `, also filed by ${names(cell.foreign)}` : ''}`,
    checked: 'looked, nothing met the bar',
    unreported: 'not reported',
    unknown: 'nothing filed'
  }[cell.state];
  return `${issue}, ${section.label}: ${said}`;
};

export const KeeperMark = ({ keeper }) => (keeper ? (
  <AgentMark {...handOf(keeper.agent)} caption={keeper.derived ? 'Usually filed by' : 'Kept by'} glyph />
) : null);

/* The key to an empty bay, printed only for the bays this unit has. */
const LEGEND = [
  ['checked', 'Braced: the agent looked and nothing met the bar.'],
  ['unreported', 'Open: the agent didn’t report. Not the same silence.'],
  ['foreign', 'A second mark: another hand filed into a column it doesn’t keep.']
];

const legendFor = grid => LEGEND.filter(([state]) => grid.rows.some(row => row.cells.some(cell => (
  state === 'foreign' ? cell.foreign.length : cell.state === state
))));

/**
 * One paper's run as a storage unit: an issue per row, a column per section.
 * Each bay opens that issue at that section. Replaces the plain issue list
 * the rail used to print; the row labels carry the same dates.
 */
export default function EditionShelfUnit({ paper, selectedIssueId = '', onOpen, onArchive }) {
  const grid = shelfGrid(paper, selectedIssueId);
  if (!grid.rows.length) return null;
  const tones = sectionTones(grid.sections);
  const columns = { '--unit-columns': Math.max(grid.sections.length, 1) };
  const legend = legendFor(grid);
  return (
    <section className="edition-unit" aria-label={`${paper.title}, issue by issue`}>
      <div className="edition-unit__body">
        {grid.sections.length ? (
          <div className="edition-unit__heads" style={columns}>
            <span />
            {grid.sections.map(section => (
              <span key={section.key} className="edition-unit__head" title={section.label}>
                <KeeperMark keeper={section.keeper} />
                <span>{section.label.split(/[\s&,]+/)[0]}</span>
              </span>
            ))}
          </div>
        ) : null}
        <div className="edition-unit__frame" style={columns}>
          {grid.rows.map(row => (
            <React.Fragment key={row.issueId}>
              <button
                type="button"
                className={`edition-unit__row${row.current ? ' is-current' : ''}`}
                aria-current={row.current ? 'page' : undefined}
                aria-label={issueLine({ issueLabel: paper.issueLabel, number: row.number }) || row.label}
                onClick={() => onOpen(row.issueId)}
              >
                {row.label}
              </button>
              {grid.sections.length ? row.cells.map((cell, index) => {
                const section = grid.sections[index];
                return (
                  <button
                    key={cell.section}
                    type="button"
                    className={`edition-unit__bay edition-unit__bay--${cell.state}${cell.state === 'filled' ? ` edition-tone--${tones[cell.section]}` : ''}${row.current ? ' is-current' : ''}`}
                    aria-label={bayLabel(row, section, cell, paper.issueLabel)}
                    onClick={() => onOpen(row.issueId, cell.section)}
                  >
                    {cell.state === 'filled' ? <span aria-hidden="true">{cell.count}</span> : null}
                    {cell.foreign.length ? (
                      <span className="edition-unit__foreign" aria-hidden="true">
                        {cell.foreign.map(agent => (
                          <span key={agent.key} className={`agent-mark__glyph agent-mark__glyph--${agent.shape}`}>
                            <span>{agent.initials}</span>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              }) : <span className="edition-unit__bay edition-unit__bay--unknown" aria-hidden="true" />}
            </React.Fragment>
          ))}
        </div>
        <div className="edition-unit__legs" aria-hidden="true"><span /><span /></div>
        <button type="button" className="edition-shelf__archive" onClick={onArchive}>
          All issues →
        </button>
      </div>
      {legend.length ? (
        <dl className="edition-unit__legend">
          {legend.map(([state, line]) => (
            <div key={state}>
              <dt className={`edition-unit__bay edition-unit__bay--${state === 'foreign' ? 'filled edition-tone--red' : state}`} aria-hidden="true">
                {state === 'foreign' ? <span className="edition-unit__foreign"><span className="agent-mark__glyph agent-mark__glyph--circle"><span>Cl</span></span></span> : null}
              </dt>
              <dd>{line}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * On a phone, the stand is a row of small units, one per paper; each opens
 * its paper. Its issues are a tap away in Browse.
 */
export function EditionShelfStrip({ papers = [], paper, onChoose }) {
  if (papers.length < 2) return null;
  return (
    <nav className="edition-strip" aria-label="Publications">
      {papers.map((row) => {
        const grid = shelfGrid(row);
        const tones = sectionTones(grid.sections);
        const current = row.profile === paper?.profile;
        return (
          <button
            key={row.profile}
            type="button"
            className={`edition-strip__paper${current ? ' is-current' : ''}`}
            aria-current={current ? 'true' : undefined}
            onClick={() => onChoose(row)}
          >
            {grid.sections.length ? (
              <span className="edition-unit__frame edition-unit__frame--mini" style={{ '--unit-columns': grid.sections.length }} aria-hidden="true">
                {grid.rows.slice(-5).flatMap(item => item.cells.map(cell => (
                  <span
                    key={`${item.issueId}:${cell.section}`}
                    className={`edition-unit__bay edition-unit__bay--${cell.state}${cell.state === 'filled' ? ` edition-tone--${tones[cell.section]}` : ''}${item.current ? ' is-current' : ''}`}
                  />
                )))}
              </span>
            ) : null}
            <span className="edition-strip__title">{row.title}</span>
            <span className="edition-strip__meta">{row.issues.length} {row.issues.length === 1 ? 'issue' : 'issues'}</span>
          </button>
        );
      })}
    </nav>
  );
}
