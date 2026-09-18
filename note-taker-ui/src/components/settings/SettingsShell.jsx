import React from 'react';
import { Link } from 'react-router-dom';
import { SETTINGS_SECTIONS, searchSettingsRegistry } from '../../settings/settingsRegistry';

const SettingsShell = ({
  section,
  onSectionChange,
  searchQuery,
  onSearchQueryChange,
  onSearchSelect,
  onHelp,
  children
}) => {
  const results = searchQuery ? searchSettingsRegistry(searchQuery) : [];

  return (
    <div className="settings-redesign__shell">
      <aside className="settings-redesign__sidebar">
        <h1 className="settings-redesign__title">Settings</h1>
        <div className="settings-redesign__search">
          <input
            type="search"
            placeholder="Find a setting…"
            aria-label="Find a setting"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>
        <nav className="settings-redesign__nav" aria-label="Settings sections">
          {Object.values(SETTINGS_SECTIONS).map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id && !searchQuery ? 'is-active' : ''}
              aria-current={section === item.id && !searchQuery ? 'page' : undefined}
              onClick={() => onSectionChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-redesign__sidelinks">
          <Link to="/connections">Connections <span aria-hidden="true">↗</span></Link>
          <button type="button" onClick={onHelp}>Help & shortcuts <span aria-hidden="true">?</span></button>
        </div>
      </aside>
      <main className="settings-redesign__main">
        {searchQuery ? (
          <section>
            <h2 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Find a setting</h2>
            <p className="settings-redesign__help">{results.length} {results.length === 1 ? 'match' : 'matches'} for “{searchQuery}”</p>
            {results.length === 0 ? (
              <p className="settings-redesign__help">Try “text”, “email”, “export”, or “agent”.</p>
            ) : results.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="settings-redesign__fact"
                style={{ width: '100%', background: 'none', border: '0', borderBottom: '1px solid var(--settings-rule)', cursor: 'pointer', textAlign: 'left' }}
                onClick={() => onSearchSelect(entry)}
              >
                <span>
                  <span className="settings-redesign__eyebrow">{entry.section === 'connections' ? 'Connections' : SETTINGS_SECTIONS[entry.section]?.label}</span>
                  <strong style={{ display: 'block', fontFamily: 'var(--noeis-serif, Georgia, serif)', fontSize: '1.25rem', fontWeight: 400 }}>{entry.title}</strong>
                  <span className="settings-redesign__help">{entry.description}</span>
                </span>
              </button>
            ))}
            <button type="button" className="settings-redesign__link" onClick={() => onSearchQueryChange('')}>
              Back to {SETTINGS_SECTIONS[section]?.label}
            </button>
          </section>
        ) : children}
      </main>
    </div>
  );
};

export default SettingsShell;
