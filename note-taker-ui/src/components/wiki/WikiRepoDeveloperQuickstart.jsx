import React, { useMemo } from 'react';
import { extractRepoDeveloperQuickstart } from './wikiRepoQuickstart';

const QuickstartRow = ({ label, children }) => {
  if (!children) return null;
  return (
    <div className="wiki-read__repo-quickstart-row">
      <span className="wiki-read__repo-quickstart-label">{label}</span>
      <div className="wiki-read__repo-quickstart-value">{children}</div>
    </div>
  );
};

const CommandValue = ({ command = '' }) => (
  <code className="wiki-read__repo-quickstart-code">{command}</code>
);

const WikiRepoDeveloperQuickstart = ({ page }) => {
  const quickstart = useMemo(() => extractRepoDeveloperQuickstart(page), [page]);
  if (!quickstart) return null;

  const { run, test, deploy, keyPaths = [] } = quickstart;

  return (
    <section className="wiki-read__repo-quickstart" aria-label="Developer quickstart">
      <div className="wiki-read__repo-quickstart-head">
        <span className="wiki-read__repo-quickstart-kicker">Repo wiki</span>
        <h4>Developer quickstart</h4>
        <p>Commands and paths pulled from this page&apos;s repository sources.</p>
      </div>
      <div className="wiki-read__repo-quickstart-grid">
        <QuickstartRow label="Run">
          {run ? <CommandValue command={run} /> : null}
        </QuickstartRow>
        <QuickstartRow label="Test">
          {test ? <CommandValue command={test} /> : null}
        </QuickstartRow>
        <QuickstartRow label="Deploy">
          {deploy?.frontend || deploy?.api ? (
            <div className="wiki-read__repo-quickstart-deploy">
              {deploy.frontend ? (
                <span><strong>Frontend</strong> {deploy.frontend}</span>
              ) : null}
              {deploy.api ? (
                <span><strong>API</strong> {deploy.api}</span>
              ) : null}
            </div>
          ) : deploy?.summary ? (
            <span>{deploy.summary}</span>
          ) : null}
        </QuickstartRow>
        <QuickstartRow label="Key paths">
          {keyPaths.length ? (
            <ul className="wiki-read__repo-quickstart-paths">
              {keyPaths.map(path => (
                <li key={path}><code>{path}</code></li>
              ))}
            </ul>
          ) : null}
        </QuickstartRow>
      </div>
    </section>
  );
};

export default WikiRepoDeveloperQuickstart;
