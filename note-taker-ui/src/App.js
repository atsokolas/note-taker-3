import React, { Suspense, lazy, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import WikiFrontPage from './components/wiki/WikiFrontPage';
import Judgment from './pages/Judgment';
import JudgmentMirror from './pages/JudgmentMirror';
import WeeklyBrief from './pages/WeeklyBrief';
import NotFound from './pages/NotFound';
import { isAppRoute, rememberReturnPath } from './navigation/appRoutes';
import { Analytics } from '@vercel/analytics/react';
import Register from './components/Register';
import Login from './components/Login';
import Landing from './pages/Landing';
import CommandPalette from './components/CommandPalette';
import KeyboardShortcutOverlay from './components/KeyboardShortcutOverlay';
import ProductFeedbackModal from './components/ProductFeedbackModal';
import { clearStoredTokens, hasUsableStoredToken } from './api';
import { fetchUiSettings, saveUiSettings } from './api/uiSettings';
import {
  applyUiSettingsToRoot,
  loadUiSettingsFromStorage,
  normalizeUiSettings,
  persistUiSettingsToStorage
} from './settings/uiPreferences';
import { Page } from './components/ui';
import AppShell from './layout/AppShell';
import TopBar from './layout/TopBar';
import TourProvider from './tour/TourProvider';
import TourManager from './tour/TourManager';
import OnboardingBuildBanner from './onboarding/OnboardingBuildBanner';
import FirstRunGate from './onboarding/FirstRunGate';
import OnboardingWalkthrough from './onboarding/OnboardingWalkthrough';
import { buildCanonicalArticlePath } from './utils/sourceRoutes';
import {
  buildThinkPosturePath,
  consumeGoToChord,
  getPrimaryNavItems,
  getSecondaryNavItems,
  getTopBarUtilityNavItems,
  isGoToTypingTarget
} from './navigation/appNavigation';
import { namesAThinkObject } from './pages/thinkNotesModel';
import { useSystemStatus } from './system/useSystemStatus';
import { SystemStatusProvider } from './system/SystemStatusContext';
import { AgentRailProvider } from './agent/AgentRailContext';
import AgentRail from './agent/AgentRail';
import { hasContextualAgentRail } from './agent/contextualAgentContracts';
import { NoeisSurfaceProvider, useNoeisSurfaceState } from './surface/NoeisSurfaceContext';
import { NoeisCapabilityProvider } from './system/NoeisCapabilityProvider';
import { NoeisLoopProvider } from './system/NoeisLoopProvider';
import './styles/theme.css';
import './styles/global.css';
import './App.css';
import './styles/reading-layout.css';
import './styles/dashboard-refresh.css';
import './styles/idea-workbench.css';
import './styles/brand-energy.css';
import './styles/design-preview.css';
import './styles/stitch-editorial.css';
import './surface/surface-frame.css';
import './styles/semantic-theme.css';

const Trending = lazy(() => import('./pages/Trending'));
const AllHighlights = lazy(() => import('./pages/AllHighlights'));
const Search = lazy(() => import('./pages/Search'));
const TagBrowser = lazy(() => import('./pages/TagBrowser'));
const Collections = lazy(() => import('./pages/Collections'));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail'));
const Views = lazy(() => import('./pages/Views'));
const ViewDetail = lazy(() => import('./pages/ViewDetail'));
const Export = lazy(() => import('./pages/Export'));
const Library = lazy(() => import('./pages/Library'));
const ThinkMode = lazy(() => import('./pages/ThinkMode'));
const ThinkNotes = lazy(() => import('./pages/ThinkNotes'));
const MapView = lazy(() => import('./pages/MapView'));
const ReviewMode = lazy(() => import('./pages/ReviewMode'));
const ReturnQueue = lazy(() => import('./pages/ReturnQueue'));
const Settings = lazy(() => import('./pages/Settings'));
const Wiki = lazy(() => import('./pages/Wiki'));
/* Home is not code-split.
   /wiki is where the wordmark, / and /paper all land, so this is needed on
   every cold start — and splitting it meant the browser only asked for it
   after main.js had downloaded and parsed. That is a second round trip in
   series before anything can be drawn, with a full-screen splash held over it
   the whole way. A chunk you always need is not a chunk. */
const WikiArticle = lazy(() => import('./components/wiki/WikiArticle'));
const Contradictions = lazy(() => import('./pages/Contradictions'));
/* Not code-split. /judgment is one of the four rooms and the one a citation
   trail ends in, so its chunk is asked for on a cold open — and splitting it
   means the browser only requests it after main.js has downloaded and parsed,
   a second round trip in series before any of the claim can be drawn. */
const WikiIngestRun = lazy(() => import('./pages/WikiIngestRun'));
const WikiOnboarding = lazy(() => import('./pages/WikiOnboarding'));
const HowToUse = lazy(() => import('./pages/HowToUse'));
const Integrations = lazy(() => import('./pages/Integrations'));
const AgentConnectAuthorize = lazy(() => import('./pages/AgentConnectAuthorize'));
const AgentTaskRun = lazy(() => import('./pages/AgentTaskRun'));
const AiSecondBrain = lazy(() => import('./pages/AiSecondBrain'));
const GuidesHub = lazy(() => import('./pages/GuidesHub'));
const Examples = lazy(() => import('./pages/Examples'));
const PublicProofGallery = lazy(() => import('./pages/PublicProofGallery'));
const SecondBrainApp = lazy(() => import('./pages/SecondBrainApp'));
const AiNoteTakingWorkflow = lazy(() => import('./pages/AiNoteTakingWorkflow'));
const PersonalKnowledgeManagementAi = lazy(() => import('./pages/PersonalKnowledgeManagementAi'));
const MostNoteAppsSolveCaptureNotRecall = lazy(() => import('./pages/MostNoteAppsSolveCaptureNotRecall'));
const ReadwiseIsNotASecondBrain = lazy(() => import('./pages/ReadwiseIsNotASecondBrain'));
const HighlightsIntoConcepts = lazy(() => import('./pages/HighlightsIntoConcepts'));
const AiReadingWithoutLosingJudgment = lazy(() => import('./pages/AiReadingWithoutLosingJudgment'));
const BestSecondBrainAppForFounders = lazy(() => import('./pages/BestSecondBrainAppForFounders'));
const BestSecondBrainAppForResearchers = lazy(() => import('./pages/BestSecondBrainAppForResearchers'));
const ImportReadingArchiveIntoNoeis = lazy(() => import('./pages/ImportReadingArchiveIntoNoeis'));
const SourceBackedSynthesisWorkflow = lazy(() => import('./pages/SourceBackedSynthesisWorkflow'));
const FromSavedArticleToDraftInNoeis = lazy(() => import('./pages/FromSavedArticleToDraftInNoeis'));
const MarketingAnalytics = lazy(() => import('./pages/MarketingAnalytics'));
const SearchConsoleOpportunities = lazy(() => import('./pages/SearchConsoleOpportunities'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const DesignPreview = lazy(() => import('./pages/DesignPreview'));
const SharedConcept = lazy(() => import('./pages/SharedConcept'));
const SharedQuestion = lazy(() => import('./pages/SharedQuestion'));
const SharedWikiPage = lazy(() => import('./pages/SharedWikiPage'));
const SharedWikiCollectionPage = lazy(() => import('./pages/SharedWikiCollectionPage'));
const PublicWikiComparison = lazy(() => import('./pages/PublicWikiComparison'));

/* A route that is still arriving is not an event.
   This used to be a full-viewport splash — an eyebrow, a headline in 3.4rem
   serif, and a shimmering bar — announcing that the wiki workspace was being
   prepared. Held for five seconds it read as the product's slowest moment
   dressed as its grandest. Now nothing is drawn at all until the wait is long
   enough to be worth admitting, and then it is one quiet line. */
const RouteLoadingFallback = () => (
  <div className="page-loading" role="status" aria-live="polite">
    <span className="page-loading__word">Still coming…</span>
  </div>
);

const scheduleDeferredStyleLoad = (callback) => {
  let frame = 0;
  let idle = 0;
  let timeout = 0;
  const run = () => {
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(callback, { timeout: 350 });
      return;
    }
    timeout = window.setTimeout(callback, 0);
  };
  if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(run);
  else timeout = window.setTimeout(callback, 0);
  return () => {
    if (frame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    if (timeout) window.clearTimeout(timeout);
  };
};

const bootstrapDevTokenFromLocation = () => {
  if (process.env.NODE_ENV !== 'development') return false;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const devToken = params.get('devToken');
    if (!devToken) return false;
    localStorage.setItem('token', devToken);
    localStorage.setItem('authToken', devToken);
    localStorage.setItem('jwt', devToken);
    return true;
  } catch (_error) {
    return false;
  }
};

/* Think has one face — the note — and a set of still-addressable postures
   behind it. Which one renders is decided by whether the URL names an object,
   so links from Library, Wiki and the palette keep landing where they point. */
const ThinkSurface = () => {
  const location = useLocation();
  return namesAThinkObject(location.search) ? <ThinkMode /> : <ThinkNotes />;
};

const LegacyConceptRedirect = () => {
  const { tagName, tag } = useParams();
  const conceptName = String(tagName || tag || '').trim();
  return <Navigate to={buildThinkPosturePath('concepts', conceptName)} replace />;
};

const LegacyNotebookRedirect = () => {
  const { entryId = '' } = useParams();
  return <Navigate to={buildThinkPosturePath('notebook', entryId)} replace />;
};

const LegacyQuestionRedirect = () => {
  const { questionId = '' } = useParams();
  return <Navigate to={buildThinkPosturePath('questions', questionId)} replace />;
};

const LegacyArticleRedirect = () => {
  const { id } = useParams();
  return <Navigate to={buildCanonicalArticlePath(id)} replace />;
};

const LegacyWikiPageRedirect = () => {
  const { id = '' } = useParams();
  const location = useLocation();
  const trimmedId = String(id).trim();
  const legacyParams = new URLSearchParams(location.search);
  const mode = legacyParams.get('mode') === 'edit' ? '&mode=edit' : '';
  const workspacePath = trimmedId
    ? `/wiki/workspace?page=${encodeURIComponent(trimmedId)}${mode}`
    : '/wiki/workspace';

  return <Navigate to={workspacePath} replace />;
};

const DataIntegrationsRedirect = () => {
  const location = useLocation();
  const hash = location.hash || '#sources';
  return <Navigate to={`/connections${location.search}${hash}`} replace />;
};

export const isPublicSharePath = (pathname = '') => pathname.startsWith('/share/');

const PublicRoutes = ({ chromeStoreLink, handleLoginSuccess, uiSettings }) => {
  const location = useLocation();
  const isShareRoute = isPublicSharePath(location.pathname);
  const isLongformRoute = (
    location.pathname === '/ai-second-brain'
    || location.pathname === '/second-brain-app'
    || location.pathname === '/ai-note-taking-workflow'
    || location.pathname === '/guides'
    || location.pathname === '/examples'
    || location.pathname === '/proof'
    || location.pathname === '/personal-knowledge-management-ai'
    || location.pathname === '/most-note-apps-solve-capture-not-recall'
    || location.pathname === '/readwise-is-not-a-second-brain'
    || location.pathname === '/highlights-into-concepts'
    || location.pathname === '/ai-reading-without-losing-judgment'
    || location.pathname === '/best-second-brain-app-for-founders'
    || location.pathname === '/best-second-brain-app-for-researchers'
    || location.pathname === '/import-reading-archive-into-noeis'
    || location.pathname === '/source-backed-synthesis-workflow'
    || location.pathname === '/from-saved-article-to-draft-in-noeis'
    || location.pathname === '/design-preview'
  );
  const isEditorialPublicRoute = (
    location.pathname === '/'
    || location.pathname === '/privacy'
    || location.pathname === '/terms'
    || isShareRoute
    || isLongformRoute
  );
  const publicContainerClassName = [
    'auth-pages-container',
    isLongformRoute ? 'auth-pages-container--scroll' : '',
    isEditorialPublicRoute ? 'auth-pages-container--public' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={publicContainerClassName}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/guides" element={<GuidesHub />} />
          <Route path="/examples" element={<Examples />} />
          <Route path="/proof" element={<PublicProofGallery />} />
          <Route path="/ai-second-brain" element={<AiSecondBrain />} />
          <Route path="/second-brain-app" element={<SecondBrainApp />} />
          <Route path="/ai-note-taking-workflow" element={<AiNoteTakingWorkflow />} />
          <Route path="/personal-knowledge-management-ai" element={<PersonalKnowledgeManagementAi />} />
          <Route path="/most-note-apps-solve-capture-not-recall" element={<MostNoteAppsSolveCaptureNotRecall />} />
          <Route path="/readwise-is-not-a-second-brain" element={<ReadwiseIsNotASecondBrain />} />
          <Route path="/highlights-into-concepts" element={<HighlightsIntoConcepts />} />
          <Route path="/ai-reading-without-losing-judgment" element={<AiReadingWithoutLosingJudgment />} />
          <Route path="/best-second-brain-app-for-founders" element={<BestSecondBrainAppForFounders />} />
          <Route path="/best-second-brain-app-for-researchers" element={<BestSecondBrainAppForResearchers />} />
          <Route path="/import-reading-archive-into-noeis" element={<ImportReadingArchiveIntoNoeis />} />
          <Route path="/source-backed-synthesis-workflow" element={<SourceBackedSynthesisWorkflow />} />
          <Route path="/from-saved-article-to-draft-in-noeis" element={<FromSavedArticleToDraftInNoeis />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfUse />} />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="/share/concepts/:slug" element={<SharedConcept />} />
          <Route path="/share/questions/:slug" element={<SharedQuestion />} />
          <Route path="/share/wiki/collection/:idOrSlug" element={<SharedWikiCollectionPage />} />
          <Route path="/share/wiki/:idOrSlug/comparison" element={<PublicWikiComparison />} />
          <Route path="/share/wiki/:idOrSlug" element={<SharedWikiPage />} />
          <Route path="/settings/connected-agents/authorize" element={<AgentConnectAuthorize />} />
          <Route path="/a/run/:taskId" element={<AgentTaskRun />} />
          <Route
            path="/register"
            element={(
              <Register
                chromeStoreLink={chromeStoreLink}
                onLoginSuccess={handleLoginSuccess}
              />
            )}
          />
          <Route
            path="/login"
            element={(
              <Login
                onLoginSuccess={handleLoginSuccess}
                chromeStoreLink={chromeStoreLink}
                brandEnergy={uiSettings.brandEnergy}
              />
            )}
          />
          <Route path="*" element={<PublicFallback />} />
        </Routes>
      </Suspense>
    </div>
  );
};

/* Two different answers to two different questions.
   A page of the product, reached without being signed in, sends you to sign in
   and remembers where you were going. Anything else does not exist and says
   so. Both used to be one redirect to the marketing home, which answered
   neither: a link to your own wiki and a mistyped URL both landed on a sales
   page, and nothing on it said why. */
const PublicFallback = () => {
  const location = useLocation();
  const wantsApp = isAppRoute(location.pathname);
  useEffect(() => {
    if (wantsApp) rememberReturnPath(location);
  }, [location, wantsApp]);
  if (wantsApp) return <Navigate to="/login" replace />;
  return <NotFound />;
};

/* Stable authenticated runtime.
 *
 * These boundaries must live outside App. Defining them inside App creates a
 * new React component type whenever settings, tour state, or system status
 * changes; React then tears down the entire room, refetches its object, and
 * drops in-flight Agent work. The renderer may change as App state changes,
 * but this component identity does not. */
const AuthenticatedLayoutRuntime = ({ renderLayout, openPalette, setShortcutOverlayOpen }) => {
  const shellLocation = useLocation();
  const navigate = useNavigate();
  const { surface } = useNoeisSurfaceState();

  useEffect(() => {
    let primedAt = 0;
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
        return;
      }

      const next = consumeGoToChord({ primedAt }, event);
      primedAt = next.primedAt;
      if (next.to) {
        event.preventDefault();
        event.stopPropagation();
        setShortcutOverlayOpen(false);
        navigate(next.to);
        return;
      }

      const isText = isGoToTypingTarget(event.target);
      if (isText) return;
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setShortcutOverlayOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [navigate, openPalette, setShortcutOverlayOpen]);

  return renderLayout({ shellLocation, navigate, surface });
};

const AuthenticatedAppRuntime = ({ renderLayout, openPalette, setShortcutOverlayOpen }) => (
  <TourProvider>
    <NoeisCapabilityProvider>
      <NoeisLoopProvider>
        <AgentRailProvider>
          <NoeisSurfaceProvider>
            <AuthenticatedLayoutRuntime
              renderLayout={renderLayout}
              openPalette={openPalette}
              setShortcutOverlayOpen={setShortcutOverlayOpen}
            />
          </NoeisSurfaceProvider>
        </AgentRailProvider>
      </NoeisLoopProvider>
    </NoeisCapabilityProvider>
  </TourProvider>
);

const AppRouterContent = ({
  isAuthenticated,
  publicRouteProps,
  renderLayout,
  openPalette,
  setShortcutOverlayOpen
}) => {
  const location = useLocation();
  const shouldUsePublicRoutes = !isAuthenticated || isPublicSharePath(location.pathname);

  if (shouldUsePublicRoutes) return <PublicRoutes {...publicRouteProps} />;
  return (
    <AuthenticatedAppRuntime
      renderLayout={renderLayout}
      openPalette={openPalette}
      setShortcutOverlayOpen={setShortcutOverlayOpen}
    />
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => (
    bootstrapDevTokenFromLocation() || hasUsableStoredToken()
  ));
  const [isLoading, setIsLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteReturnFocusRef = useRef(null);
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false);
  const [productFeedbackOpen, setProductFeedbackOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState(() => loadUiSettingsFromStorage());
  const [uiSettingsSaving, setUiSettingsSaving] = useState(false);
  const systemStatus = useSystemStatus();
  const {
    setBackgroundWork: setSystemBackgroundWork,
    setLatestReceipt: setSystemLatestReceipt,
    clearRecentReceipts: clearSystemRecentReceipts,
    setRecoverableFailure: setSystemRecoverableFailure,
    clearRecoverableFailure: clearSystemRecoverableFailure,
    resetSystemStatus
  } = systemStatus;
  const systemStatusControls = useMemo(() => ({
    setBackgroundWork: setSystemBackgroundWork,
    setLatestReceipt: setSystemLatestReceipt,
    clearRecentReceipts: clearSystemRecentReceipts,
    setRecoverableFailure: setSystemRecoverableFailure,
    clearRecoverableFailure: clearSystemRecoverableFailure,
    resetSystemStatus
  }), [
    setSystemBackgroundWork,
    setSystemLatestReceipt,
    clearSystemRecentReceipts,
    setSystemRecoverableFailure,
    clearSystemRecoverableFailure,
    resetSystemStatus
  ]);
  const systemStatusContextValue = useMemo(() => ({
    controls: systemStatusControls,
    snapshot: {
      backgroundWork: systemStatus.backgroundWork,
      latestReceipt: systemStatus.latestReceipt,
      recentReceipts: systemStatus.recentReceipts,
      recoverableFailure: systemStatus.recoverableFailure
    }
  }), [
    systemStatusControls,
    systemStatus.backgroundWork,
    systemStatus.latestReceipt,
    systemStatus.recentReceipts,
    systemStatus.recoverableFailure
  ]);

  // Your existing Chrome Store link
  const chromeStoreLink = "https://chromewebstore.google.com/detail/note-taker/bekllegjmjbnamphjnkifpijkhoiepaa?hl=en-US&utm_source=ext_sidebar";

  useEffect(() => (
    scheduleDeferredStyleLoad(() => {
      import('./styles/think-home-polish.css');
    })
  ), []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const devToken = params.get('devToken');
      if (!devToken) return;
      params.delete('devToken');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
      setIsAuthenticated(true);
    } catch (_error) {
      // Ignore malformed dev bootstrap parameters.
    }
  }, []);

  useEffect(() => {
    if (bootstrapDevTokenFromLocation() || hasUsableStoredToken()) {
      setIsAuthenticated(true);
    } else {
      clearStoredTokens();
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Add the editorial body class. Don't pin color-scheme inline — that
    // overrides the dark/light selectors in theme.css and stitch-editorial.css
    // and was part of why the dark mode toggle appeared to do nothing.
    // color-scheme is now set inside the theme CSS itself, gated on
    // data-ui-theme, so flipping the theme attribute carries it along.
    document.body.classList.add('noeis-editorial');
    return () => {
      document.body.classList.remove('noeis-editorial');
    };
  }, []);

  useLayoutEffect(() => {
    const normalized = applyUiSettingsToRoot(document.documentElement, uiSettings);
    persistUiSettingsToStorage(normalized);
  }, [uiSettings]);

  // Live-update on system theme change when user preference is 'auto'.
  // No-op for explicit 'light' or 'dark'.
  useEffect(() => {
    if (uiSettings?.theme !== 'auto') return undefined;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = () => {
      // Re-apply with the same settings; resolveActiveTheme will re-read mq.
      applyUiSettingsToRoot(document.documentElement, uiSettings);
    };
    if (mq.addEventListener) mq.addEventListener('change', handle);
    else if (mq.addListener) mq.addListener(handle);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handle);
      else if (mq.removeListener) mq.removeListener(handle);
    };
  }, [uiSettings]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const syncUiSettings = async () => {
      try {
        const remote = await fetchUiSettings();
        if (cancelled) return;
        const normalized = normalizeUiSettings(remote);
        setUiSettings(normalized);
        persistUiSettingsToStorage(normalized);
      } catch (error) {
        console.error('Failed to fetch UI settings:', error);
      }
    };
    syncUiSettings();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const handleLogout = () => {
    clearStoredTokens();
    setIsAuthenticated(false);
    window.location.href = '/';
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleUiSettingsChange = async (updates) => {
    const optimistic = normalizeUiSettings({ ...uiSettings, ...updates });
    setUiSettings(optimistic);
    if (!isAuthenticated) return;
    setUiSettingsSaving(true);
    try {
      const saved = await saveUiSettings(optimistic);
      const normalized = normalizeUiSettings(saved);
      setUiSettings(normalized);
      persistUiSettingsToStorage(normalized);
    } catch (error) {
      console.error('Failed to save UI settings:', error);
    } finally {
      setUiSettingsSaving(false);
    }
  };

  const openPalette = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      paletteReturnFocusRef.current = document.activeElement;
    }
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  useEffect(() => {
    if (paletteOpen) return undefined;
    const returnTarget = paletteReturnFocusRef.current;
    paletteReturnFocusRef.current = null;
    if (!returnTarget || !document.contains(returnTarget)) return undefined;
    window.setTimeout(() => returnTarget.focus(), 0);
    return undefined;
  }, [paletteOpen, closePalette]);

  useEffect(() => {
    if (!paletteOpen) return undefined;
    const getFocusable = () => Array.from(document.querySelectorAll(
      '.palette-overlay button, .palette-overlay [href], .palette-overlay input, .palette-overlay textarea, .palette-overlay select, .palette-overlay [tabindex]:not([tabindex="-1"])'
    )).filter((node) => !node.disabled && node.getAttribute('aria-hidden') !== 'true');
    const handlePointerDown = (event) => {
      if (event.target === document.querySelector('.palette-overlay')) {
        closePalette();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closePalette();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [paletteOpen, closePalette]);

  const primaryNavItems = getPrimaryNavItems();
  const secondaryNavItems = getSecondaryNavItems();

  if (isLoading) return <RouteLoadingFallback />;

  const renderAppLayout = ({ shellLocation, surface }) => {
    const topBarAccountMenuItems = [
      {
        label: 'Feedback',
        onClick: () => setProductFeedbackOpen(true)
      },
      {
        label: 'Chrome Extension',
        href: chromeStoreLink,
        external: true
      },
      {
        label: 'Logout',
        onClick: handleLogout
      }
    ];
    const moreNavItems = secondaryNavItems.filter((item) => item.label !== 'Connections');
    const utilityNavItems = getTopBarUtilityNavItems();

    const routes = (
      <Page className="page-area">
        <CommandPalette open={paletteOpen} onClose={closePalette} />
        <KeyboardShortcutOverlay open={shortcutOverlayOpen} onClose={() => setShortcutOverlayOpen(false)} />
        <ProductFeedbackModal open={productFeedbackOpen} onClose={() => setProductFeedbackOpen(false)} />
        <TourManager />
        {/* A new user starts where the flow starts. Home is the Paper, but you do
            not land on home before you have one — this gate runs wherever they
            enter, not just on the wiki. */}
        <FirstRunGate />
        {/* Ambient progress for a build the user walked away from. Mounted at the
            shell so it follows them wherever onboarding sends them next. */}
        <OnboardingBuildBanner />
        {/* Four short stops over the user's own product, running while their first
            page builds. Ends on the Paper — home. */}
        <OnboardingWalkthrough />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            {/* One front page. The Paper is the top of the wiki now, so every
                way in — the wordmark, /, the old /paper — lands on the same
                page rather than on two that say overlapping things. */}
            <Route path="/" element={<Navigate to="/wiki" replace />} />
            <Route path="/paper" element={<Navigate to="/wiki" replace />} />
            {/* Today was a launcher for rooms that are now the nav itself. The
                route resolves so existing links keep working; it lands on the
                morning paper rather than on a menu. */}
            <Route path="/today" element={<Navigate to="/wiki" replace />} />
            <Route path="/library" element={<Library />} />
            {/* Think opens the note you were last in. The legacy postures stay
                addressable: a URL that names a concept, question, thread or
                entry still opens that object in the older workspace. */}
            <Route path="/think" element={<ThinkSurface />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/return-queue" element={<ReturnQueue />} />
            <Route path="/review" element={<ReviewMode />} />
            {/* AT-394: /wiki is the newspaper front page; the maintenance
                workspace stays one hairline away at /wiki/workspace. */}
            {/* Judgment: the index is a list of claim sentences; opening one
                is the claim itself. */}
            <Route path="/judgment" element={<Judgment />} />
            <Route path="/judgment/mirror" element={<JudgmentMirror />} />
            <Route path="/judgment/:pageId" element={<Judgment />} />
            {/* The week, gathered from marks the surfaces already carry. */}
            <Route path="/week" element={<WeeklyBrief />} />
            <Route path="/wiki" element={<WikiFrontPage />} />
            <Route path="/wiki/dossiers" element={<WikiFrontPage initialKind="investment" />} />
            {/* Contradiction as a view, not a tag: where the library
                disagrees with itself, both passages side by side. */}
            <Route path="/wiki/contradictions" element={<Contradictions />} />
            <Route path="/wiki/list" element={<Navigate to="/wiki/workspace?view=list" replace />} />
            {/* The reading. The operational workspace — chat pane, graph,
                queues — stays where it was, at /wiki/workspace. */}
            <Route path="/wiki/read/:id" element={<WikiArticle />} />
            <Route path="/wiki/workspace" element={<Wiki />} />
            <Route path="/wiki/activity/:runId" element={<WikiIngestRun />} />
            <Route path="/onboarding/wiki" element={<WikiOnboarding />} />
            <Route path="/wiki/:id" element={<LegacyWikiPageRedirect />} />
            <Route
              path="/settings"
              element={(
                <Settings
                  uiSettings={uiSettings}
                  uiSettingsSaving={uiSettingsSaving}
                  onUiSettingsChange={handleUiSettingsChange}
                />
              )}
            />
            <Route path="/how-to-use" element={<HowToUse />} />
            <Route path="/connections" element={<Integrations />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings/connected-agents/authorize" element={<AgentConnectAuthorize />} />
            <Route path="/a/run/:taskId" element={<AgentTaskRun />} />
            <Route path="/data-integrations" element={<DataIntegrationsRedirect />} />
            <Route path="/marketing-analytics" element={<MarketingAnalytics />} />
            <Route path="/search-console-opportunities" element={<SearchConsoleOpportunities />} />
            <Route path="/guides" element={<GuidesHub />} />
            <Route path="/examples" element={<Examples />} />
            <Route path="/proof" element={<PublicProofGallery />} />
            <Route path="/ai-second-brain" element={<AiSecondBrain />} />
            <Route path="/second-brain-app" element={<SecondBrainApp />} />
            <Route path="/ai-note-taking-workflow" element={<AiNoteTakingWorkflow />} />
            <Route path="/personal-knowledge-management-ai" element={<PersonalKnowledgeManagementAi />} />
            <Route path="/most-note-apps-solve-capture-not-recall" element={<MostNoteAppsSolveCaptureNotRecall />} />
            <Route path="/readwise-is-not-a-second-brain" element={<ReadwiseIsNotASecondBrain />} />
            <Route path="/highlights-into-concepts" element={<HighlightsIntoConcepts />} />
            <Route path="/ai-reading-without-losing-judgment" element={<AiReadingWithoutLosingJudgment />} />
            <Route path="/best-second-brain-app-for-founders" element={<BestSecondBrainAppForFounders />} />
            <Route path="/best-second-brain-app-for-researchers" element={<BestSecondBrainAppForResearchers />} />
            <Route path="/import-reading-archive-into-noeis" element={<ImportReadingArchiveIntoNoeis />} />
            <Route path="/source-backed-synthesis-workflow" element={<SourceBackedSynthesisWorkflow />} />
            <Route path="/from-saved-article-to-draft-in-noeis" element={<FromSavedArticleToDraftInNoeis />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
            <Route path="/design-preview" element={<DesignPreview />} />
            <Route path="/share/concepts/:slug" element={<SharedConcept />} />
            <Route path="/share/wiki/collection/:idOrSlug" element={<SharedWikiCollectionPage />} />
            <Route path="/share/wiki/:idOrSlug/comparison" element={<PublicWikiComparison />} />
            <Route path="/share/wiki/:idOrSlug" element={<SharedWikiPage />} />
            <Route path="/share/questions/:slug" element={<SharedQuestion />} />

            {/* Legacy/feature routes kept for compatibility */}
            <Route path="/brain" element={<Navigate to="/review?tab=patterns" replace />} />
            <Route path="/resurface" element={<Navigate to="/review?tab=resurface" replace />} />
            <Route path="/all-highlights" element={<AllHighlights />} />
            <Route path="/tags" element={<TagBrowser />} />
            <Route path="/tags/:tagName" element={<LegacyConceptRedirect />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/:slug" element={<CollectionDetail />} />
            <Route path="/concepts" element={<LegacyConceptRedirect />} />
            <Route path="/concepts/:tag" element={<LegacyConceptRedirect />} />
            <Route path="/notebook" element={<LegacyNotebookRedirect />} />
            <Route path="/notebook/:entryId" element={<LegacyNotebookRedirect />} />
            <Route path="/questions" element={<LegacyQuestionRedirect />} />
            <Route path="/questions/:questionId" element={<LegacyQuestionRedirect />} />
            <Route path="/question/:questionId" element={<LegacyQuestionRedirect />} />
            <Route path="/views" element={<Views />} />
            <Route path="/views/:id" element={<ViewDetail />} />
            <Route path="/search" element={<Search />} />
            <Route path="/journey" element={<Navigate to="/review?tab=journey" replace />} />
            <Route path="/concept/:tag" element={<LegacyConceptRedirect />} />
            <Route path="/board" element={<Navigate to="/think?tab=concepts" replace />} />
            <Route path="/studio-board" element={<Navigate to="/think?tab=concepts" replace />} />
            <Route path="/boards" element={<Navigate to="/think?tab=concepts" replace />} />
            <Route path="/boards/*" element={<Navigate to="/think?tab=concepts" replace />} />
            <Route path="/articles/:id" element={<LegacyArticleRedirect />} />
            <Route path="/trending" element={<Trending />} />
            <Route path="/export" element={<Export />} />
            {/* Redirect authenticated users away from auth pages */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            {/* Signed in, an unknown path rendered nothing at all — a top bar
                over an empty column, which reads as the page having failed. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Page>
    );

    return (
      <AppShell
        brandEnergy={uiSettings.brandEnergy}
        surface={surface}
        /* Think owns its thought partner inside the writing surface. The shell
           must never mount a second, generic agent beside it. */
        rightRail={hasContextualAgentRail(shellLocation.pathname)
          && !(shellLocation.pathname === '/think' || shellLocation.pathname.startsWith('/think/'))
          ? <AgentRail />
          : null}
        topBar={(
          <TopBar
            routeLocation={shellLocation}
            brandEnergy={uiSettings.brandEnergy}
            primaryNav={primaryNavItems}
            utilityNav={utilityNavItems}
            secondaryNav={moreNavItems}
            searchMode="field"
            onSearchOpen={openPalette}
            theme={uiSettings.theme}
            onThemeChange={(nextTheme) => handleUiSettingsChange({ theme: nextTheme })}
            themeSaving={uiSettingsSaving}
            accountMenuItems={topBarAccountMenuItems}
            systemStatus={{
              backgroundWork: systemStatus.backgroundWork,
              latestReceipt: systemStatus.latestReceipt,
              recentReceipts: systemStatus.recentReceipts,
              clearRecentReceipts: systemStatus.clearRecentReceipts,
              recoverableFailure: systemStatus.recoverableFailure
            }}
            onSystemStatusRetry={() => {
              const retry = systemStatus.recoverableFailure?.retry;
              systemStatus.clearRecoverableFailure();
              if (typeof retry === 'function') {
                retry();
              }
            }}
            className=""
          />
        )}
      >
        {routes}
      </AppShell>
    );
  };

  return (
    <SystemStatusProvider value={systemStatusContextValue}>
      <Router>
        <Analytics />
        <AppRouterContent
          isAuthenticated={isAuthenticated}
          publicRouteProps={{ chromeStoreLink, handleLoginSuccess, uiSettings }}
          renderLayout={renderAppLayout}
          openPalette={openPalette}
          setShortcutOverlayOpen={setShortcutOverlayOpen}
        />
      </Router>
    </SystemStatusProvider>
  );
}

export default App;
