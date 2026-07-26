import React from 'react';
import '../../styles/wiki-investment-maintenance-comparison.css';

const percent = value => (
  Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—'
);

const WikiInvestmentMaintenanceComparison = ({ comparison }) => {
  if (!comparison?.version) return null;
  const changes = Array.isArray(comparison.claimChanges) ? comparison.claimChanges : [];
  const scenarios = Array.isArray(comparison.expectations?.scenarios)
    ? comparison.expectations.scenarios.filter(row => row.changed)
    : [];
  return (
    <section className="wiki-investment-change" aria-labelledby="wiki-investment-change-title">
      <p className="wiki-investment-change__eyebrow">What actually changed</p>
      <h2 id="wiki-investment-change-title">{comparison.headline}</h2>
      <p>{comparison.summary}</p>
      {changes.length ? (
        <div className="wiki-investment-change__claims">
          {changes.map((change, index) => (
            <article key={`${change.kind}-${change.section}-${index}`}>
              <span>{change.kind}</span>
              <h3>{change.title}</h3>
              <p>{change.detail}</p>
              <strong>Why it matters</strong>
              <p>{change.whyItMatters}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="wiki-investment-change__preserved">No decision-relevant claim was rewritten.</p>
      )}
      <div className="wiki-investment-change__expectations">
        <h3>{comparison.expectations?.title || 'Implied expectations'}</h3>
        <p>{comparison.expectations?.summary || 'No expectations comparison is available.'}</p>
        {scenarios.length ? (
          <ul>
            {scenarios.map(row => (
              <li key={row.terminalMultiple}>
                {row.terminalMultiple}× terminal multiple: required growth moved from {percent(row.beforeRequiredCagr)} to {percent(row.afterRequiredCagr)}.
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="wiki-investment-change__judgment">{comparison.judgmentSummary}</p>
    </section>
  );
};

export default WikiInvestmentMaintenanceComparison;
