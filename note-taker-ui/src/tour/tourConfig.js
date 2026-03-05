export const TOUR_EXTENSION_URL = 'https://chromewebstore.google.com/detail/note-taker/bekllegjmjbnamphjnkifpijkhoiepaa?hl=en-US&utm_source=ext_sidebar';

export const TOUR_STEPS = [
  {
    id: 'install_extension',
    title: 'Install the browser extension',
    body: 'Use the extension to save and highlight from any article. Install it, pin it, then come back here.',
    route: '/think?tab=home',
    targetSelector: '[data-tour-anchor="install-extension"]',
    placement: 'bottom',
    signalKey: 'extensionConnected',
    cta: { label: 'Open Chrome Web Store', href: TOUR_EXTENSION_URL }
  },
  {
    id: 'capture_first_highlight',
    title: 'Capture your first highlight',
    body: 'Open an article, save it with the extension, then highlight a passage on the page.',
    route: '/library',
    targetSelector: '[data-tour-anchor="library-highlights-scope"]',
    placement: 'right',
    signalKey: 'firstHighlightCaptured',
    cta: { label: 'Go to Library', route: '/library' }
  },
  {
    id: 'create_concept_from_highlight',
    title: 'Create a concept from a highlight',
    body: 'In Highlights, expand a card and choose “Add to Concept” to create or attach a concept.',
    route: '/library?scope=highlights&highlightView=concept',
    targetSelector: '[data-tour-anchor="highlight-add-concept"], [data-tour-anchor="library-highlights-panel"]',
    placement: 'left',
    signalKey: 'conceptFromHighlight',
    cta: { label: 'Open Highlights', route: '/library?scope=highlights&highlightView=concept' }
  },
  {
    id: 'organize_workspace',
    title: 'Organize in the concept workspace',
    body: 'Open Think → Concepts and attach or move items in the workspace stages (Inbox, Working, Draft, Archive).',
    route: '/think?tab=concepts',
    targetSelector: '[data-testid="concept-add-material-button"], [data-testid="think-concepts-empty-create-button"]',
    placement: 'bottom',
    signalKey: 'workspaceOrganized',
    cta: { label: 'Open Think Concepts', route: '/think?tab=concepts' }
  },
  {
    id: 'semantic_search',
    title: 'Use semantic search',
    body: 'Search by meaning to discover related highlights, concepts, and notes.',
    route: '/search?mode=semantic',
    targetSelector: '[data-tour-anchor="semantic-mode-button"], [data-tour-anchor="semantic-search-input"]',
    placement: 'bottom',
    signalKey: 'semanticSearchUsed',
    cta: { label: 'Run demo semantic search', action: 'run_semantic_demo' }
  }
];

export const TOUR_STEP_IDS = TOUR_STEPS.map(step => step.id);

export const TOUR_SIGNALS_DEFAULT = Object.freeze({
  extensionConnected: false,
  firstHighlightCaptured: false,
  conceptFromHighlight: false,
  workspaceOrganized: false,
  semanticSearchUsed: false
});

export const TOUR_STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  COMPLETED: 'completed'
});

export const TOUR_CACHE_KEY = 'tour.state.v1';

export const TOUR_RESUME_QUERY = 'tour';
export const TOUR_RESUME_VALUE = 'resume';
