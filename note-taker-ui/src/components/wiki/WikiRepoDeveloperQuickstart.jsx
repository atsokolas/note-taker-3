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

const CommandBlock = ({ command }) => {
  if (!command?.command) return null;
  return (
    <div className="wiki-read__repo-quickstart-command">
      <span className="wiki-read__repo-quickstart-cwd">{command.cwd}</span>
      <code className="wiki-read__repo-quickstart-code">{command.command}</code>
      {command.entrypoint ? (
        <span className="wiki-read__repo-quickstart-entrypoint">→ {command.entrypoint}</span>
      ) : null}
      {command.sourceFile ? (
        <code className="wiki-read__repo-quickstart-source">{command.sourceFile}</code>
      ) : null}
    </div>
  );
};

const WikiRepoDeveloperQuickstart = ({ page }) => {
  const quickstart = useMemo(() => extractRepoDeveloperQuickstart(page), [page]);
  if (!quickstart) return null;

  const {
    install = [],
    apiRun,
    uiRun,
    test,
    build,
    envVars = [],
    localUrls = [],
    deploy,
    keyPaths = []
  } = quickstart;

  return (
    <section className="wiki-read__repo-quickstart" aria-label="Developer quickstart">
      <div className="wiki-read__repo-quickstart-head">
        <span className="wiki-read__repo-quickstart-kicker">Repo wiki</span>
        <h4>Developer quickstart</h4>
        <p>Runnable commands and paths pulled from this page&apos;s repository sources.</p>
      </div>
      <div className="wiki-read__repo-quickstart-grid">
        <QuickstartRow label="Install">
          {install.length ? (
            <div className="wiki-read__repo-quickstart-command-stack">
              {install.map((command) => (
                <CommandBlock key={`${command.cwd}-${command.command}`} command={command} />
              ))}
            </div>
          ) : null}
        </QuickstartRow>
        <QuickstartRow label="API run">
          {apiRun ? <CommandBlock command={apiRun} /> : null}
        </QuickstartRow>
        <QuickstartRow label="UI run">
          {uiRun ? <CommandBlock command={uiRun} /> : null}
        </QuickstartRow>
        <QuickstartRow label="Test">
          {test ? <CommandBlock command={test} /> : null}
        </QuickstartRow>
        <QuickstartRow label="Build">
          {build ? <CommandBlock command={build} /> : null}
        </QuickstartRow>
        <QuickstartRow label="Env">
          {envVars.length ? (
            <code className="wiki-read__repo-quickstart-code">{envVars.join(', ')}</code>
          ) : null}
        </QuickstartRow>
        <QuickstartRow label="Local">
          {localUrls.length ? (
            <div className="wiki-read__repo-quickstart-local">
              {localUrls.map((entry) => (
                <span key={`${entry.label}-${entry.url}`}>
                  <strong>{entry.label}</strong> {entry.url}
                </span>
              ))}
            </div>
          ) : null}
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
