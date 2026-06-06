import { z } from 'zod';

const pageTypes = ['topic', 'concept', 'entity', 'source', 'question', 'comparison', 'overview', 'project', 'log'];
const statuses = ['draft', 'published', 'archived'];
const visibilities = ['private', 'shared'];

const optionalEnum = (values) => z.enum(values).optional();
const pageIdShape = {
  pageId: z.string().describe('Noeis wiki page id.')
};
const sourceShape = z.record(z.any()).describe('Source object accepted by the Noeis wiki API. For URL ingest use { type: "url", url }. For pasted text use { type: "text", text, title? }.');

export const writeTools = [
  {
    name: 'create_page',
    description: 'Create a new private draft wiki page. Use this only after checking search_pages/list_pages to avoid duplicates. Requires an agent-write token.',
    inputSchema: {
      title: z.string().min(1).describe('Page title.'),
      pageType: optionalEnum(pageTypes),
      body: z.union([z.string(), z.record(z.any())]).optional().describe('Optional body as plain text or TipTap JSON.'),
      sourceScope: optionalEnum(['entire_library', 'selected_sources', 'current_item']),
      initialSourceRef: z.record(z.any()).optional().describe('Optional initial source reference to attach.')
    },
    handler: (client, args) => client.createPage(args)
  },
  {
    name: 'update_page',
    description: 'Patch an existing wiki page. High-impact when changing status, visibility, title, or body; confirm user intent before broad edits.',
    inputSchema: {
      ...pageIdShape,
      title: z.string().optional(),
      body: z.union([z.string(), z.record(z.any())]).optional().describe('Replacement body as plain text or TipTap JSON.'),
      pageType: optionalEnum(pageTypes),
      status: optionalEnum(statuses),
      visibility: optionalEnum(visibilities),
      sourceScope: optionalEnum(['entire_library', 'selected_sources', 'current_item'])
    },
    handler: (client, args) => client.updatePage(args)
  },
  {
    name: 'archive_page',
    description: 'High-impact: archive a wiki page by soft-deleting it. Confirm explicitly before calling.',
    inputSchema: pageIdShape,
    handler: (client, args) => client.archivePage(args)
  },
  {
    name: 'ingest_source',
    description: 'Call this when the user shares a URL, pasted text, or source object and wants it folded into the wiki. Requires an agent-write token.',
    inputSchema: {
      source: sourceShape
    },
    handler: (client, args) => client.ingestSource(args)
  },
  {
    name: 'draft_page',
    description: 'Ask the maintenance agent to refresh a specific page from its current sources. Use after ingesting relevant material or when a page has drift.',
    inputSchema: {
      ...pageIdShape,
      hint: z.string().optional().describe('Optional instruction for the external agent; the current Noeis API may ignore it until the maintenance endpoint supports hints.')
    },
    handler: (client, args) => client.draftPage(args)
  },
  {
    name: 'ask_page',
    description: 'Ask a page-scoped question and append the answer to the page discussion log with citations where available.',
    inputSchema: {
      ...pageIdShape,
      question: z.string().min(1).max(1000)
    },
    handler: (client, args) => client.askPage(args)
  },
  {
    name: 'promote_answer',
    description: 'Promote an answered page discussion into a new wiki page. Use when a Q&A should become durable wiki knowledge.',
    inputSchema: {
      ...pageIdShape,
      discussionId: z.string().describe('Discussion id from the page discussions array.'),
      newTitle: z.string().optional().describe('Optional title for the promoted wiki page.')
    },
    handler: (client, args) => client.promoteAnswer(args)
  },
  {
    name: 'lint_wiki',
    description: 'Run the dedicated wiki health check. Use to find contradictions, stale claims, orphan pages, missing cross-references, and gaps.',
    inputSchema: {
      scope: optionalEnum(['all', 'page']).describe('Optional lint scope. The API uses page scope when pageId is provided.'),
      pageId: z.string().optional().describe('Optional page id for page-scoped lint.')
    },
    handler: (client, args) => client.lintWiki(args)
  },
  {
    name: 'apply_autolink',
    description: 'Convert plain mentions in a page into inline wiki links to an existing target page.',
    inputSchema: {
      ...pageIdShape,
      targetPageId: z.string().describe('Existing wiki page id to link to.')
    },
    handler: (client, args) => client.applyAutolink(args)
  },
  {
    name: 'add_source',
    description: 'Attach a source reference to an existing wiki page. Use this before draft_page when the page needs more evidence.',
    inputSchema: {
      ...pageIdShape,
      source: sourceShape
    },
    handler: (client, args) => client.addSource(args)
  },
  {
    name: 'remove_source',
    description: 'Detach a source reference from a wiki page. Confirm user intent because this can weaken citations.',
    inputSchema: {
      ...pageIdShape,
      sourceRefId: z.string().describe('Source reference id from list_sources/get_page.')
    },
    handler: (client, args) => client.removeSource(args)
  },
  {
    name: 'update_schema',
    description: 'High-impact: replace the wiki schema content. Confirm explicitly because it changes future page generation behavior.',
    inputSchema: {
      content: z.string().describe('Full schema markdown/content to save.')
    },
    handler: (client, args) => client.updateSchema(args)
  },
  {
    name: 'accept_proposal',
    description: 'Accept an emerging-page proposal and create a maintained draft wiki page from it.',
    inputSchema: {
      proposalId: z.string().describe('Proposal id from list_proposals.')
    },
    handler: (client, args) => client.acceptProposal(args)
  },
  {
    name: 'dismiss_proposal',
    description: 'Dismiss an emerging-page proposal that should not become a wiki page.',
    inputSchema: {
      proposalId: z.string().describe('Proposal id from list_proposals.'),
      reason: z.string().optional().describe('Optional short reason.')
    },
    handler: (client, args) => client.dismissProposal(args)
  },
  {
    name: 'merge_proposal',
    description: 'High-impact: merge an emerging-page proposal into an existing wiki page instead of creating a new page.',
    inputSchema: {
      proposalId: z.string().describe('Proposal id from list_proposals.'),
      pageId: z.string().describe('Existing wiki page id to merge into.')
    },
    handler: (client, args) => client.mergeProposal(args)
  },
  {
    name: 'create_article',
    description: 'Save or update a normal Library article. Use this for user requests to add an article to the reading library, not for wiki ingestion.',
    inputSchema: {
      title: z.string().min(1),
      url: z.string().min(1),
      content: z.string().optional(),
      folderId: z.string().optional(),
      author: z.string().optional(),
      publicationDate: z.string().optional(),
      siteName: z.string().optional()
    },
    handler: (client, args) => client.createArticle(args)
  },
  {
    name: 'create_highlight',
    description: 'Create a highlight on an existing Library article.',
    inputSchema: {
      articleId: z.string().describe('Library article id.'),
      text: z.string().min(3),
      note: z.string().optional(),
      tags: z.array(z.string()).optional(),
      anchor: z.record(z.any()).optional(),
      color: z.string().optional()
    },
    handler: (client, args) => client.createHighlight(args)
  },
  {
    name: 'create_question',
    description: 'Create a Think question, optionally linked to a concept and highlights.',
    inputSchema: {
      text: z.string().min(1),
      status: optionalEnum(['open', 'answered']),
      conceptName: z.string().optional(),
      linkedTagName: z.string().optional(),
      blocks: z.array(z.record(z.any())).optional(),
      linkedHighlightId: z.string().optional(),
      linkedHighlightIds: z.array(z.string()).optional(),
      linkedNotebookEntryId: z.string().optional()
    },
    handler: (client, args) => client.createQuestion(args)
  },
  {
    name: 'update_question',
    description: 'Patch a Think question. Confirm user intent before changing text, links, or status.',
    inputSchema: {
      questionId: z.string().describe('Question id.'),
      text: z.string().optional(),
      status: optionalEnum(['open', 'answered']),
      conceptName: z.string().optional(),
      linkedTagName: z.string().optional(),
      blocks: z.array(z.record(z.any())).optional(),
      linkedHighlightId: z.string().optional(),
      linkedHighlightIds: z.array(z.string()).optional(),
      linkedNotebookEntryId: z.string().optional()
    },
    handler: (client, args) => client.updateQuestion(args)
  },
  {
    name: 'update_concept',
    description: 'Patch a Think concept. Confirm user intent before changing description, pinned material, or workbench state.',
    inputSchema: {
      name: z.string().describe('Concept name.'),
      description: z.string().optional(),
      summary: z.string().optional(),
      status: z.string().optional(),
      pinnedHighlightIds: z.array(z.string()).optional(),
      pinnedArticleIds: z.array(z.string()).optional(),
      pinnedNoteIds: z.array(z.string()).optional(),
      ideaWorkbench: z.record(z.any()).optional(),
      ideaWorkbenchMeta: z.record(z.any()).optional()
    },
    handler: (client, args) => client.updateConcept(args)
  },
  {
    name: 'pin_highlight_to_concept',
    description: 'Attach an existing highlight to a Think concept.',
    inputSchema: {
      name: z.string().describe('Concept name.'),
      highlightId: z.string().describe('Highlight id.')
    },
    handler: (client, args) => client.pinHighlightToConcept(args)
  }
];
