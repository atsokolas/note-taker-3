export const wikiSchemaPrompt = {
  name: 'wiki_schema',
  description: 'Fetch the current Noeis wiki schema markdown and use it as page-building guidance.',
  arguments: []
};

export const renderWikiSchemaPrompt = async (client) => {
  const schema = await client.getSchema();
  const content = String(schema?.content || '').trim() || 'No custom wiki schema has been saved yet.';
  return {
    description: 'Current Noeis wiki schema',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Use this Noeis wiki schema when reading, drafting, or proposing wiki changes:\n\n${content}`
        }
      }
    ]
  };
};
