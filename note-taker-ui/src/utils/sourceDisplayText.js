const clean = (value = '') => String(value || '').trim();

const decodeBasicEntities = (value = '') => String(value || '')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'");

export const cleanImportedText = (value = '') => decodeBasicEntities(value)
  .replace(/\(\s*attr\(href\)\s*\)/gi, '')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\|\s*Reading Time:\s*\d+\s*minutes?\.?/gi, '')
  .replace(/\bReading Time:\s*\d+\s*minutes?\.?/gi, '')
  .replace(/\s+/g, ' ')
  .trim();

export const cleanSourceTextForDisplay = (value = '') => {
  const withoutTemplateArtifacts = cleanImportedText(
    String(value || '')
      .replace(/<\/(p|div|li|br)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\bURL:\s*https?:\/\/\S+/gi, '')
    .replace(/\bName:\s*/gi, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean(withoutTemplateArtifacts)
    .replace(/(?:^|(?:[.]|\s+·)\s*)Thought and Opinion\s*$/i, '')
    .replace(/\s+·\s*$/g, '')
    .trim();
};

const IMPORT_SCAFFOLD_LINE = /^(?:URL:\s*https?:\/\/\S+|Reading Time:\s*\d+\s*minutes?\.?|Thought and Opinion|Read Caption)$/i;

export const cleanImportedArticleDocument = (doc) => {
  if (!doc?.body) return doc;

  doc.body.querySelectorAll('p, div, li').forEach((node) => {
    if (IMPORT_SCAFFOLD_LINE.test(clean(node.textContent))) node.remove();
  });

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    node.nodeValue = decodeBasicEntities(node.nodeValue)
      .replace(/\(\s*attr\(href\)\s*\)/gi, '')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\|\s*Reading Time:\s*\d+\s*minutes?\.?/gi, '')
      .replace(/\bReading Time:\s*\d+\s*minutes?\.?/gi, '')
      .replace(/[ \t]{2,}/g, ' ');
  }
  return doc;
};
