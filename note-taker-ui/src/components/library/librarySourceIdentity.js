export const sourceRowKey = (row) => {
  const source = row?.source || row || {};
  const type = String(source.type || '').trim();
  const id = String(source.id || '').trim();
  const parentId = String(source.parentId || '').trim();
  return `${type}:${id}:${parentId}`;
};

export const matchesSourceQuery = (row, query) => {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  const source = row?.source || {};
  const provenance = row?.provenance || {};
  const haystack = [
    source.title,
    source.type,
    provenance.author,
    provenance.provider,
    provenance.siteName,
    provenance.parentTitle,
    provenance.sourceLabel,
    provenance.noteType
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
};

export const isSourceAllowed = (row, allowedSourceIds) => {
  if (!(allowedSourceIds instanceof Set)) return true;
  const source = row?.source || {};
  const type = String(source.type || '').trim();
  if (type === 'note') return true;
  if (type === 'highlight') {
    return allowedSourceIds.has(String(source.parentId || ''));
  }
  return allowedSourceIds.has(String(source.id || ''));
};

export const appendUniqueSourceRows = (existing, incoming) => {
  const current = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(current.map(sourceRowKey));
  const appended = [];
  next.forEach((row) => {
    const key = sourceRowKey(row);
    if (!key || key === '::' || seen.has(key)) return;
    seen.add(key);
    appended.push(row);
  });
  return current.concat(appended);
};
