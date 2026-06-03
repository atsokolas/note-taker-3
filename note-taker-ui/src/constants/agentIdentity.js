export const AGENT_DISPLAY_NAME = 'Thought partner';
export const AGENT_CHAT_LABEL = `${AGENT_DISPLAY_NAME} chat`;
export const AGENT_STATUS_LABEL = `${AGENT_DISPLAY_NAME} status`;
export const AGENT_DEFAULT_PLACEHOLDER = 'Ask your thought partner...';
export const SPECIALIST_AGENT_LABEL = 'Specialist agent';
export const USER_BRIDGE_LABEL = 'User bridge';

export const labelForAgentActorType = (actorType = '', actorId = '') => {
  const type = String(actorType || '').trim().toLowerCase();
  const id = String(actorId || '').trim();
  if (type === 'user') return 'You';
  if (type === 'native_agent') return id ? `${AGENT_DISPLAY_NAME} · ${id}` : AGENT_DISPLAY_NAME;
  if (type === 'byo_agent') return id ? `${SPECIALIST_AGENT_LABEL} · ${id}` : SPECIALIST_AGENT_LABEL;
  return 'Unknown actor';
};
