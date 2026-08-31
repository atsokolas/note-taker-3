/**
 * Client reading of the living-team overlay. The server owns rights,
 * receipts, and the walk. This file only names what the paper can already see.
 */

export const ROLE_LABEL = Object.freeze({
  observe: 'Observe',
  research: 'Research',
  propose: 'Propose',
  decide: 'Decide',
  approve: 'Approve',
  publish: 'Publish',
  administer: 'Administer'
});

export const SENTENCE_LABEL = Object.freeze({
  fact: 'Fact',
  inference: 'Inference',
  recommendation: 'Needed',
  unknown: 'Unknown'
});

export const POSTURE_LABEL = Object.freeze({
  investigate: 'Investigate',
  watch: 'Watch',
  act: 'Act',
  avoid: 'Avoid',
  no_action: 'No action',
  closed: 'Closed'
});

const months = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]);

export const formatDay = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

export const casePath = (pageId) => (
  pageId ? `/judgment/${encodeURIComponent(pageId)}` : ''
);

export const partedLine = (pair = {}) => {
  const axes = Array.isArray(pair.parted) ? pair.parted : [];
  if (!axes.length) return '';
  const names = axes.join(', ');
  const left = pair.left?.label || 'One reading';
  const right = pair.right?.label || 'another';
  return `${left} and ${right} part on ${names}.`;
};

export const approvalLine = (row = {}) => {
  const who = row.actor?.label || 'A signer';
  const when = formatDay(row.at);
  if (row.supersededBy) {
    return `${who} approved an earlier version${when ? ` on ${when}` : ''}. The paper has moved.`;
  }
  return `${who} approved this version${when ? ` on ${when}` : ''}.`;
};

export const hasRoom = (team) => {
  if (!team?.visible) return false;
  const members = Array.isArray(team.members) ? team.members : [];
  return members.length > 1
    || Boolean(team.mandate?.purpose)
    || (Array.isArray(team.handoffs) && team.handoffs.length > 0);
};

const joinMemory = (parts) => {
  if (parts.length < 2) return parts[0] || '';
  if (parts.length === 2) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
};

export const roomMemoryLine = (team) => {
  if (!hasRoom(team)) return '';
  const parts = [];
  if (team.members?.length > 1) parts.push('who may sit here');
  if (team.dissent?.length) parts.push('where minds part');
  if (team.approvals?.length) parts.push('which version was approved');
  if (team.handoffs?.length) parts.push('how the case changed hands');
  const memory = joinMemory(parts);
  return memory ? `The room remembers ${memory}.` : '';
};
