const COMMAND_MAP = {
  paragraph: {
    id: 'paragraph',
    label: 'Paragraph',
    description: 'Plain body text for drafting.',
    keywords: ['text', 'body', 'plain'],
    isActive: (editor) => editor.isActive('paragraph'),
    apply: (chain) => chain.setParagraph()
  },
  title: {
    id: 'title',
    label: 'Title',
    description: 'Large title-style heading.',
    keywords: ['h1', 'heading', 'headline'],
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    apply: (chain) => chain.toggleHeading({ level: 1 })
  },
  heading: {
    id: 'heading',
    label: 'Heading',
    description: 'Primary section heading.',
    keywords: ['h2', 'section', 'header'],
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    apply: (chain) => chain.toggleHeading({ level: 2 })
  },
  subhead: {
    id: 'subhead',
    label: 'Subhead',
    description: 'Smaller secondary heading.',
    keywords: ['h3', 'subheading', 'subheader'],
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
    apply: (chain) => chain.toggleHeading({ level: 3 })
  },
  bold: {
    id: 'bold',
    label: 'Bold',
    description: 'Emphasize the selected text.',
    keywords: ['strong', 'emphasis'],
    isActive: (editor) => editor.isActive('bold'),
    apply: (chain) => chain.toggleBold()
  },
  italic: {
    id: 'italic',
    label: 'Italic',
    description: 'Add softer inline emphasis.',
    keywords: ['emphasis', 'style'],
    isActive: (editor) => editor.isActive('italic'),
    apply: (chain) => chain.toggleItalic()
  },
  bulletList: {
    id: 'bulletList',
    label: 'Bulleted list',
    description: 'Capture grouped points quickly.',
    keywords: ['list', 'bullets', 'unordered', 'ul'],
    isActive: (editor) => editor.isActive('bulletList'),
    apply: (chain) => chain.toggleBulletList()
  },
  orderedList: {
    id: 'orderedList',
    label: 'Numbered list',
    description: 'Sequence steps or ranked points.',
    keywords: ['list', 'numbers', 'ordered', 'ol'],
    isActive: (editor) => editor.isActive('orderedList'),
    apply: (chain) => chain.toggleOrderedList()
  },
  quote: {
    id: 'quote',
    label: 'Quote',
    description: 'Call out a quotation or key excerpt.',
    keywords: ['blockquote', 'citation', 'pullquote'],
    isActive: (editor) => editor.isActive('blockquote'),
    apply: (chain) => chain.toggleBlockquote()
  }
};

const VARIANT_MAP = {
  full: ['paragraph', 'title', 'heading', 'subhead', 'bold', 'italic', 'bulletList', 'orderedList', 'quote'],
  slim: ['bold', 'italic', 'heading', 'bulletList', 'orderedList', 'quote']
};

export const getSlashCommandItems = (variant = 'full', extraItems = []) => {
  const ids = VARIANT_MAP[variant] || VARIANT_MAP.full;
  return [...ids.map((id) => COMMAND_MAP[id]), ...extraItems];
};

export const getSlashCommandMatch = (textBeforeCursor = '') => {
  const triggerIndex = textBeforeCursor.lastIndexOf('/');
  if (triggerIndex < 0) return null;

  const prefix = textBeforeCursor.slice(0, triggerIndex);
  const query = textBeforeCursor.slice(triggerIndex + 1);

  if (prefix && !/\s$/.test(prefix)) return null;
  if (/\s/.test(query)) return null;

  return {
    query,
    triggerIndex
  };
};

export const filterSlashCommandItems = (items = [], query = '') => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return items;

  const scoreItem = (item) => {
    const label = String(item.label || '').toLowerCase();
    const keywords = Array.isArray(item.keywords) ? item.keywords.map((value) => String(value || '').toLowerCase()) : [];
    const prioritizedQueries = Array.isArray(item.prioritizeForQuery)
      ? item.prioritizeForQuery.map((value) => String(value || '').toLowerCase())
      : [];
    const haystack = [label, String(item.description || '').toLowerCase(), ...keywords].join(' ');
    if (!haystack.includes(normalizedQuery)) return -1;

    let score = 0;
    if (label === normalizedQuery) score += 120;
    if (label.startsWith(normalizedQuery)) score += 80;
    if (keywords.includes(normalizedQuery)) score += 70;
    if (keywords.some((value) => value.startsWith(normalizedQuery))) score += 45;
    if (label.includes(normalizedQuery)) score += 25;
    if (String(item.id || '').toLowerCase().startsWith('insert')) score += 15;
    if (item.intent === 'artifact') score += 15;
    if (String(item.artifactType || '').toLowerCase() === normalizedQuery) score += 35;
    if (prioritizedQueries.includes(normalizedQuery)) score += 60;
    return score;
  };

  return items
    .map((item, index) => ({ item, index, score: scoreItem(item) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
};

export const getNextSlashCommandIndex = ({ currentIndex = 0, itemCount = 0, key = '' }) => {
  if (!itemCount) return 0;
  if (key === 'ArrowDown') return (currentIndex + 1) % itemCount;
  if (key === 'ArrowUp') return (currentIndex - 1 + itemCount) % itemCount;
  return currentIndex;
};

export const applySlashCommand = ({ editor, command, range }) => {
  if (!editor || !command) return false;

  const chain = editor.chain().focus();
  if (range) {
    chain.deleteRange(range);
  }
  if (typeof command.apply === 'function') {
    command.apply(chain).run();
    return true;
  }
  chain.run?.();
  command.onSelect?.({ editor });
  return true;
};
