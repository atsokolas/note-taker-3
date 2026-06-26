const clean = (value) => String(value || '').trim();

const stripHtml = (value = '') => clean(
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
);

export const cleanSourceTextForDisplay = (value = '') => {
  const withoutTemplateArtifacts = stripHtml(value)
    .replace(/\(\s*attr\(href\)\s*\)/gi, '')
    .replace(/\|\s*Reading Time:\s*\d+\s*minutes?\.?/gi, '')
    .replace(/\bReading Time:\s*\d+\s*minutes?\.?/gi, '')
    .replace(/\bURL:\s*https?:\/\/\S+/gi, '')
    .replace(/\bName:\s*/gi, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

  return withoutTemplateArtifacts
    .replace(/(?:^|(?:[.]|\s+·)\s*)Thought and Opinion\s*$/i, '')
    .replace(/\s+·\s*$/g, '')
    .trim();
};
