const TOUR_CACHE_KEY = 'tour.state.v1';

const buildDevJwt = ({
  subject = 'playwright-user',
  expiresInSeconds = 60 * 60
} = {}) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  });
  return `${header}.${payload}.signature`;
};

const buildPausedTourState = (overrides = {}) => ({
  status: 'paused',
  currentStepId: null,
  completedStepIds: [],
  isFirstTimeVisitor: false,
  signals: {
    extensionConnected: false,
    firstHighlightCaptured: false,
    conceptFromHighlight: false,
    workspaceOrganized: false,
    semanticSearchUsed: false
  },
  startedAt: '2026-04-19T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-04-19T12:00:00.000Z',
  open: false,
  ...overrides,
  signals: {
    extensionConnected: false,
    firstHighlightCaptured: false,
    conceptFromHighlight: false,
    workspaceOrganized: false,
    semanticSearchUsed: false,
    ...(overrides.signals || {})
  }
});

const installDevAuth = async (page, {
  token = buildDevJwt(),
  hasSeenLanding = true,
  workspacePanels = ['/think'],
  pausedTourState = buildPausedTourState()
} = {}) => {
  await page.addInitScript((payload) => {
    const {
      authToken,
      seenLanding,
      panelKeys,
      tourCacheKey,
      tourState
    } = payload;

    window.localStorage.setItem('token', authToken);
    window.localStorage.setItem('authToken', authToken);
    window.localStorage.setItem('jwt', authToken);
    if (seenLanding) {
      window.localStorage.setItem('hasSeenLanding', 'true');
    }
    (Array.isArray(panelKeys) ? panelKeys : []).forEach((panelKey) => {
      if (!panelKey) return;
      window.localStorage.setItem(`workspace-right-open:${panelKey}`, 'true');
    });
    if (tourState && tourCacheKey) {
      window.localStorage.setItem(tourCacheKey, JSON.stringify(tourState));
    }
  }, {
    authToken: token,
    seenLanding: hasSeenLanding,
    panelKeys: workspacePanels,
    tourCacheKey: TOUR_CACHE_KEY,
    tourState: pausedTourState
  });
  return token;
};

const dismissTourIfVisible = async (page) => {
  const skipButton = page.getByRole('button', { name: 'Skip' });
  if (!await skipButton.count()) return false;
  await skipButton.first().click();
  await page.waitForTimeout(400);
  return true;
};

const appendDevToken = (route, token) => {
  if (!token) return route;
  const hasQuery = route.includes('?');
  return `${route}${hasQuery ? '&' : '?'}devToken=${encodeURIComponent(token)}`;
};

const bootstrapAuthenticatedPage = async (page, {
  token = buildDevJwt(),
  bootstrapRoute = '/think?tab=home',
  hasSeenLanding = true,
  workspacePanels = ['/think'],
  pausedTourState = buildPausedTourState(),
  dismissTour = true,
  waitUntil = 'networkidle'
} = {}) => {
  await installDevAuth(page, {
    token,
    hasSeenLanding,
    workspacePanels,
    pausedTourState
  });
  await page.goto(appendDevToken(bootstrapRoute, token), { waitUntil });
  if (dismissTour) {
    await dismissTourIfVisible(page);
  }
  return token;
};

module.exports = {
  TOUR_CACHE_KEY,
  appendDevToken,
  bootstrapAuthenticatedPage,
  buildDevJwt,
  buildPausedTourState,
  dismissTourIfVisible,
  installDevAuth
};
