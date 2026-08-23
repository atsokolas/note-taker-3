import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createNoeisSystemInventory } from '../../system/noeisSystemRegistry';
import { useNoeisCapabilities } from '../../system/noeisCapabilityContext';
import { useNoeisLoops } from '../../system/noeisLoopContext';
import './system-inventory-card.css';

const KIND_LABELS = {
  surface: 'Surfaces',
  agent: 'Agents',
  capability: 'Capabilities',
  connector: 'Connectors',
  loop: 'Loops',
  theme: 'Themes'
};

const SystemInventoryCard = ({ Card, theme = 'auto', pathname = '' }) => {
  const location = useLocation();
  const capabilities = useNoeisCapabilities();
  const loopStatus = useNoeisLoops();
  const activePathname = pathname || location.pathname;
  const inventory = useMemo(() => createNoeisSystemInventory({
    pathname: activePathname,
    theme,
    connectorRuntime: capabilities.connectors,
    loopRuntime: loopStatus.loops
  }), [activePathname, capabilities.connectors, loopStatus.loops, theme]);
  const active = inventory.items.filter(item => item.status === 'active');
  const grouped = inventory.items.reduce((result, item) => {
    if (!result[item.kind]) result[item.kind] = [];
    result[item.kind].push(item);
    return result;
  }, {});

  return (
    <Card className="settings-card system-inventory-card">
      <div className="system-inventory-card__heading">
        <div>
          <p className="muted-label">System registry</p>
          <h2>What’s active</h2>
          <p className="muted">
            One read-only map of the current room, contextual agent, appearance, and registered system parts.
          </p>
        </div>
        <span className="system-inventory-card__count">{active.length} active now</span>
      </div>

      <div className="system-inventory-card__active" aria-label="Active system items">
        {active.map(item => (
          <article key={item.id} className="system-inventory-card__active-item">
            <span>{KIND_LABELS[item.kind]?.replace(/s$/, '') || item.kind}</span>
            <strong>{item.name}</strong>
            <p>{item.activeBecause[0] || item.description}</p>
          </article>
        ))}
      </div>

      <details className="system-inventory-card__details">
        <summary>Inspect the registered system</summary>
        <p className="muted small">
          Connector readiness and durable background-loop state use the same stable identities shown throughout the shell.
        </p>
        <div className="system-inventory-card__groups">
          {Object.entries(KIND_LABELS).map(([kind, label]) => (
            <section key={kind}>
              <h3>{label}</h3>
              <ul>
                {(grouped[kind] || []).map(item => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <code>{item.id}</code>
                    </div>
                    <span data-status={item.status}>{item.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="system-inventory-card__footer">
          <span>Derived from existing navigation and runtime contracts.</span>
          <Link to="/connections#sources">Inspect connection readiness</Link>
        </div>
      </details>
    </Card>
  );
};

export default SystemInventoryCard;
