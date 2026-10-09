import React from 'react';
import { agentOf } from './editionAgent';

/* An agent's mark and short name. `plain` drops the tooltip for public pages,
   where the token label someone typed is not the reader's business. */
export default function AgentMark({ runtime, label, plain = false }) {
  const agent = agentOf({ runtime, label });
  if (!agent) return null;
  return (
    <span className="agent-mark" title={plain || agent.label === agent.name ? undefined : agent.label}>
      <span className={`agent-mark__glyph agent-mark__glyph--${agent.shape}`} aria-hidden="true">
        <span>{agent.initials}</span>
      </span>
      {agent.name}
    </span>
  );
}
