import React from 'react';
import AgentMark from './AgentMark';
import { handOf } from './editionAgent';

/* Column names already carry ampersands, so the list joins with words. */
const columns = labels => (labels.length > 1
  ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  : labels[0]);

/**
 * The desk: one line per agent working on this paper, under the masthead.
 * `hands` comes from deskFor, which is empty for a paper one agent keeps, so
 * a one-hand paper prints no desk at all.
 */
export default function EditionDesk({ hands = [] }) {
  if (hands.length < 2) return null;
  return (
    <ul className="edition-desk" aria-label="The desk">
      {hands.map(hand => (
        <li key={hand.agent.key}>
          <AgentMark {...handOf(hand.agent)} />
          <span className="edition-desk__keeps">
            {[
              hand.keeps.length ? `Keeps ${columns(hand.keeps)}` : '',
              hand.usually.length ? `Usually files ${columns(hand.usually)}` : ''
            ].filter(Boolean).join(' · ') || 'Keeps no column'}
          </span>
          <span className="edition-desk__issue">{hand.thisIssue} · {hand.kept}</span>
        </li>
      ))}
    </ul>
  );
}
