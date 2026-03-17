const toTrimmedString = (value = '') => String(value || '').trim();

const flattenNotionRichText = (items = []) => (
  (Array.isArray(items) ? items : [])
    .map(item => toTrimmedString(item?.plain_text || item?.text?.content || ''))
    .filter(Boolean)
    .join('')
);

const extractNotionTitle = (page = {}) => {
  const properties = page?.properties && typeof page.properties === 'object' ? page.properties : {};
  const titleProperty = Object.values(properties).find(property => property?.type === 'title');
  return flattenNotionRichText(titleProperty?.title || []) || 'Untitled';
};

const flattenNotionProperty = (property = {}) => {
  const type = toTrimmedString(property?.type);
  if (!type) return '';
  if (type === 'title') return flattenNotionRichText(property.title || []);
  if (type === 'rich_text') return flattenNotionRichText(property.rich_text || []);
  if (type === 'select') return toTrimmedString(property.select?.name);
  if (type === 'status') return toTrimmedString(property.status?.name);
  if (type === 'multi_select') return (property.multi_select || []).map(item => toTrimmedString(item?.name)).filter(Boolean).join(', ');
  if (type === 'date') return toTrimmedString(property.date?.start);
  if (type === 'number') return property.number !== undefined && property.number !== null ? String(property.number) : '';
  if (type === 'checkbox') return property.checkbox ? 'true' : 'false';
  if (type === 'url') return toTrimmedString(property.url);
  if (type === 'email') return toTrimmedString(property.email);
  if (type === 'phone_number') return toTrimmedString(property.phone_number);
  if (type === 'people') return (property.people || []).map(item => toTrimmedString(item?.name)).filter(Boolean).join(', ');
  if (type === 'relation') return (property.relation || []).map(item => toTrimmedString(item?.id)).filter(Boolean).join(', ');
  if (type === 'formula') {
    const formula = property.formula || {};
    return toTrimmedString(formula.string || formula.number || formula.boolean || formula.date?.start || '');
  }
  return '';
};

const buildNotionPropertyLines = (page = {}) => {
  const properties = page?.properties && typeof page.properties === 'object' ? page.properties : {};
  return Object.entries(properties)
    .map(([name, property]) => {
      const value = flattenNotionProperty(property);
      if (!value) return null;
      return `${name}: ${value}`;
    })
    .filter(Boolean);
};

const blockToPlainText = (block = {}) => {
  const type = toTrimmedString(block?.type);
  if (!type) return '';
  const content = block[type] || {};
  if (type === 'to_do') return `${content.checked ? '[x]' : '[ ]'} ${flattenNotionRichText(content.rich_text || [])}`.trim();
  if (content?.rich_text) return flattenNotionRichText(content.rich_text);
  if (type === 'child_page') return `Page: ${toTrimmedString(content.title)}`;
  if (type === 'child_database' || type === 'child_data_source') return `Database: ${toTrimmedString(content.title)}`;
  if (type === 'quote') return flattenNotionRichText(content.rich_text || []);
  if (type === 'code') return flattenNotionRichText(content.rich_text || []);
  if (type === 'bookmark') return toTrimmedString(content.url);
  if (type === 'embed') return toTrimmedString(content.url);
  if (type === 'link_preview') return toTrimmedString(content.url);
  return '';
};

module.exports = {
  blockToPlainText,
  buildNotionPropertyLines,
  extractNotionTitle,
  flattenNotionProperty,
  flattenNotionRichText
};
