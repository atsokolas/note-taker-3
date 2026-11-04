import { displayDay, validDay } from './workPlannerModel';

const months = Array.from({ length: 12 }, (_, index) => ['long', 'short'].map(month => displayDay(`2000-${String(index + 1).padStart(2, '0')}-01`, { month }).toLowerCase()));
export const entryDateLabel = day => displayDay(day, { day: 'numeric', month: 'long', year: 'numeric' });

// The heading itself is the date: editing, undoing or deleting it updates the index too.
export function entryDay(text) {
  if (validDay(text)) return text;
  const match = String(text).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const month = months.findIndex(names => names.includes(match[2].toLowerCase()));
  const day = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return month >= 0 && validDay(day) ? day : '';
}

export function noteEntries(doc) {
  const entries = [];
  doc.forEach((node, position) => {
    const day = node.type.name === 'heading' && node.attrs.level === 2 && entryDay(node.textContent.trim());
    if (day) entries.push({ day, position, size: node.nodeSize });
  });
  return entries.map((entry, index) => ({ ...entry, end: entries[index + 1]?.position ?? doc.content.size }));
}
