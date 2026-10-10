import React from 'react';
import { agentOf, handOf } from './editionAgent';

/* An agent's mark and short name. `plain` drops the tooltip for public pages,
   where the token label someone typed is not the reader's business. `glyph`
   is the mark alone, named for assistive tech and on hover; `caption` says
   what the hand is to this column ("Kept by"). */
export default function AgentMark({ runtime, label, plain = false, glyph = false, caption = '' }) {
  const agent = agentOf({ runtime, label });
  if (!agent) return null;
  if (glyph) {
    return (
      <span
        className={`agent-mark__glyph agent-mark__glyph--${agent.shape}`}
        role="img"
        aria-label={caption ? `${caption} ${agent.name}` : agent.name}
        title={[caption, plain ? agent.name : agent.label].filter(Boolean).join(' ')}
      >
        <span aria-hidden="true">{agent.initials}</span>
      </span>
    );
  }
  return (
    <span className="agent-mark" title={plain || agent.label === agent.name ? undefined : agent.label}>
      <span className={`agent-mark__glyph agent-mark__glyph--${agent.shape}`} aria-hidden="true">
        <span>{agent.initials}</span>
      </span>
      {agent.name}
    </span>
  );
}

/* Who keeps a column: "Kept by" when the reader said so, "Usually filed by"
   when the paper only inferred it. */
export const KeeperMark = ({ keeper }) => (keeper ? (
  <AgentMark {...handOf(keeper.agent)} caption={keeper.derived ? 'Usually filed by' : 'Kept by'} glyph />
) : null);
