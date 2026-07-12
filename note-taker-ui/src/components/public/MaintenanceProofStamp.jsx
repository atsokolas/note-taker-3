import React from 'react';
import {
  NO_ACCEPTED_MAINTENANCE_EVENT_COPY,
  buildMaintenanceStampFacts
} from '../../utils/maintenanceProof';

const MaintenanceProofStamp = ({
  proof = null,
  className = '',
  compact = false,
  showCounts = true
}) => {
  const facts = buildMaintenanceStampFacts(proof).filter((fact) => {
    if (!showCounts && (fact.label === 'Sources' || fact.label === 'Claims')) return false;
    return true;
  });

  if (!facts.length && !proof) return null;

  return (
    <div className={className} aria-label="Maintenance proof stamp">
      <span className="maintenance-proof-stamp__eyebrow">Maintained by the owner&apos;s agent</span>
      {facts.length ? (
        <dl className={`maintenance-proof-stamp__facts${compact ? ' is-compact' : ''}`}>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="maintenance-proof-stamp__pending">{NO_ACCEPTED_MAINTENANCE_EVENT_COPY}</p>
      )}
    </div>
  );
};

export default MaintenanceProofStamp;
