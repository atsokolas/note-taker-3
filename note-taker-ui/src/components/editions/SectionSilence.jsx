import React from 'react';
import AgentMark from './AgentMark';

/* An empty section says which silence it is: an agent looked and nothing met
   its bar, or nobody reported. Anything else — an issue from before agents
   left receipts — keeps the sentence the page always printed. */
export default function SectionSilence({ silence, fallback, className, plain = false }) {
  const by = silence?.state === 'checked' ? silence.by || [] : [];
  if (by.length) {
    return (
      <p className={className}>
        {by.map((agent, index) => (
          <React.Fragment key={`${agent.runtime}:${agent.label}`}>
            {index ? (index === by.length - 1 ? ' and ' : ', ') : null}
            <AgentMark runtime={agent.runtime} label={agent.label} plain={plain} />
          </React.Fragment>
        ))}{' '}
        looked; nothing met the bar.
      </p>
    );
  }
  if (silence?.state === 'checked') return <p className={className}>An agent looked; nothing met the bar.</p>;
  if (silence?.state === 'unreported') return <p className={className}>Not reported this issue.</p>;
  return <p className={className}>{fallback}</p>;
}
