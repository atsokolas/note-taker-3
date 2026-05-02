const clean = (value) => String(value || '').trim();

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeAttribute = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;');

export const formatEditorialEvidenceHtml = (card) => {
  if (!card) return '<p></p>';
  const source = clean(card.source) || clean(card.title) || 'Source';
  const content = clean(card.content) || clean(card.title) || 'Material';
  const whyItMatters = clean(card.whyItMatters);
  return [
    `<blockquote data-source-key="${escapeAttribute(clean(card.sourceKey || card.id))}"><p>${escapeHtml(content)}</p></blockquote>`,
    `<p><em>From ${escapeHtml(source)}.</em></p>`,
    whyItMatters ? `<p>${escapeHtml(whyItMatters)}</p>` : ''
  ].filter(Boolean).join('');
};

export default formatEditorialEvidenceHtml;
