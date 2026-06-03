const cleanText = (value = '') => String(value || '').trim();

export const firstUrlInText = (value = '') => {
  const match = String(value || '').match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.;]+$/g, '') : '';
};

const commandText = (args, fallback) => cleanText(args) || cleanText(fallback);

export const classifyHomeUniversalCommand = (rawText = '') => {
  const text = cleanText(rawText);
  if (!text) return { kind: 'empty', text: '' };

  const slashMatch = text.match(/^\/([a-z]+)(?:\s+([\s\S]+))?$/i);
  if (slashMatch) {
    const verb = slashMatch[1].toLowerCase();
    const args = commandText(slashMatch[2], '');

    if (verb === 'ingest' || verb === 'source') {
      return {
        kind: 'wiki-ingest',
        text,
        source: args,
        command: `/ingest ${args}`.trim()
      };
    }
    if (['graph', 'map', 'backlinks', 'links', 'related', 'connect', 'connections'].includes(verb)) {
      return { kind: 'wiki-graph', text: args || text };
    }
    if (['wiki', 'build', 'draft', 'page', 'create', 'new'].includes(verb)) {
      return { kind: 'wiki-build', text: args || text };
    }
    if (['library', 'sources', 'read', 'reading'].includes(verb)) {
      return { kind: 'library-search', text: args || text };
    }
    if (['question', 'ask'].includes(verb)) {
      return { kind: 'question', text: args || text };
    }
    if (['concept', 'idea', 'theme', 'thesis', 'argument'].includes(verb)) {
      return { kind: 'concept', text: args || text };
    }
    if (['note', 'notebook', 'write'].includes(verb)) {
      return { kind: 'note', text: args || text };
    }
    if (verb === 'think') {
      return args ? classifyHomeUniversalCommand(args) : { kind: 'think-home', text };
    }
  }

  const lower = text.toLowerCase();
  const sourceUrl = firstUrlInText(text);
  if (sourceUrl) {
    return {
      kind: 'wiki-ingest',
      text,
      source: sourceUrl,
      command: `/ingest ${sourceUrl}`
    };
  }

  if (/\b(graph|map|backlinks?|links?|connections?|connect|related)\b/.test(lower)) {
    return { kind: 'wiki-graph', text };
  }

  if (/\b(wiki|page|build|draft|synthesis|synthesize)\b/.test(lower)) {
    return { kind: 'wiki-build', text };
  }

  if (/\b(source|sources|highlight|article|read|reading|library)\b/.test(lower)) {
    return { kind: 'library-search', text };
  }

  if (text.endsWith('?') || /\b(ask|question|why|how|what|whether)\b/.test(lower)) {
    return { kind: 'question', text };
  }

  if (/\b(concept|idea|theme|thesis|argument)\b/.test(lower)) {
    return { kind: 'concept', text };
  }

  return { kind: 'note', text };
};
