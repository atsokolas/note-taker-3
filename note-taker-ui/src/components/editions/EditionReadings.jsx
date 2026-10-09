import React from 'react';
import AgentMark from './AgentMark';
import { agentOf } from './editionAgent';

const HANDS = ['', 'one', 'two', 'three', 'four'];

/**
 * Two agents read the same source on their own. Each reading stands in its
 * own column, named by the hand that wrote it, with its own limit. The page
 * never says whether they agree: that is the reader's call.
 */
export default function EditionReadings({ item, finding, Boundary, plain = false }) {
  const readings = [
    { filedBy: item.filedBy, filedByRuntime: item.filedByRuntime, finding: item.finding, boundary: item.boundary, note: item.note },
    ...item.readings
  ];
  return (
    <div className="edition-readings">
      <p className="edition-readings__hands">
        Filed independently by {HANDS[readings.length] || readings.length} hands.
      </p>
      <div className="edition-readings__columns">
        {readings.map((reading, index) => (
          <section className="edition-readings__column" key={`${reading.filedBy}:${index}`}>
            <p className="edition-readings__by">
              {agentOf({ runtime: reading.filedByRuntime, label: reading.filedBy }) ? (
                <>
                  <AgentMark runtime={reading.filedByRuntime} label={reading.filedBy} plain={plain} />
                  ’s reading
                </>
              ) : 'A reading'}
            </p>
            {finding(reading.finding, index === 0)}
            <Boundary>{reading.boundary}</Boundary>
            {reading.note ? <p className="edition-readings__note">{reading.note}</p> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
