import React, { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
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
import { buildCanonicalArticlePath } from './utils/firstInsight';
import { buildThinkPosturePath, getPrimaryNavItems, getSecondaryNavItems } from './navigation/appNavigation';
import './styles/theme.css';
import './styles/tokens.css';
import './styles/global.css';
import './App.css';
import './styles/reading-layout.css';
import './styles/dashboard-refresh.css';
import './styles/idea-workbench.css';
import './styles/brand-energy.css';
import './styles/calm-ui-global.css';
import './styles/think-calm-d3a.css';
import './styles/calm-ui-system.css';
import './styles/design-preview.css';
import './styles/stitch-editorial.css';

const Trending = lazy(() => import('./pages/Trending'));
const AllHighlights = lazy(() => import('./pages/AllHighlights'));
const Search = lazy(() => import('./pages/Search'));
const TagBrowser = lazy(() => import('./pages/TagBrowser'));
const Collections = lazy(() => import('./pages/Collections'));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail'));
const Views = lazy(() => import('./pages/Views'));
const ViewDetail = lazy(() => import('./pages/ViewDetail'));
const Export = lazy(() => import('./pages/Export'));
const TodayMode = lazy(() => import('./pages/TodayMode'));
const Library = lazy(() => import('./pages/Library'));
const ThinkMode = lazy(() => import('./pages/ThinkMode'));
const MapView = lazy(() => import('./pages/MapView'));
const ReviewMode = lazy(() => import('./pages/ReviewMode'));
const ReturnQueue = lazy(() => import('./pages/ReturnQueue'));
const Settings = lazy(() => import('./pages/Settings'));
const Wiki = lazy(() => import('./pages/Wiki'));
const WikiProductIndex = lazy(() => import('./components/wiki/WikiProductIndex'));
const WikiIngestRun = lazy(() => import('./pages/WikiIngestRun'));
const HowToUse = lazy(() => import('./pages/HowToUse'));
const Integrations = lazy(() => import('./pages/Integrations'));
const AgentConnectAuthorize = lazy(() => import('./pages/AgentConnectAuthorize'));
const AgentTaskRun = lazy(() => import('./pages/AgentTaskRun'));
const DataIntegrations = lazy(() => import('./pages/DataIntegrations'));
const AiSecondBrain = lazy(() => import('./pages/AiSecondBrain'));
const GuidesHub = lazy(() => import('./pages/GuidesHub'));
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
const MarketingAnalytics = lazy(() => import('./pages/MarketingAnalytics'));
const SearchConsoleOpportunities = lazy(() => import('./pages/SearchConsoleOpportunities'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const DesignPreview = lazy(() => import('./pages/DesignPreview'));
const SharedConcept = lazy(() => import('./pages/SharedConcept'));
const SharedWikiPage = lazy(() => import('./pages/SharedWikiPage'));

const RouteLoadingFallback = () => {
  const isWikiRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/wiki');
  if (isWikiRoute) {
    return (
      <div className="page-loading page-loading--wiki" role="status" aria-live="polite">
        <span>Wiki</span>
        <strong>Preparing the wiki workspace</strong>
        <i aria-hidden="true" />
      </div>
    );
  }
  return <div className="page-loading" role="status" aria-live="polite">Loading...</div>;
};

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

const PublicRoutes = ({ chromeStoreLink, handleLoginSuccess, uiSettings }) => {
  const location = useLocation();
  const isLongformRoute = (
    location.pathname === '/ai-second-brain'
    || location.pathname === '/second-brain-app'
    || location.pathname === '/ai-note-taking-workflow'
    || location.pathname === '/guides'
    || location.pathname === '/personal-knowledge-management-ai'
    || location.pathname === '/most-note-apps-solve-capture-not-recall'
    || location.pathname === '/readwise-is-not-a-second-brain'
    || location.pathname === '/highlights-into-concepts'
    || location.pathname === '/ai-reading-without-losing-judgment'
    || location.pathname === '/best-second-brain-app-for-founders'
    || location.pathname === '/best-second-brain-app-for-researchers'
    || location.pathname === '/import-reading-archive-into-noeis'
    || location.pathname === '/source-backed-synthesis-workflow'
    || location.pathname === '/design-preview'
  );
  const isEditorialPublicRoute = (
    location.pathname === '/'
    || location.pathname === '/privacy'
    || location.pathname === '/terms'
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
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfUse />} />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="/share/concepts/:slug" element={<SharedConcept />} />
          <Route path="/share/wiki/:idOrSlug" element={<SharedWikiPage />} />
          <Route path="/settings/connected-agents/authorize" element={<AgentConnectAuthorize />} />
          <Route path="/a/run/:taskId" element={<AgentTaskRun />} />
          <Route path="/register" element={<Register chromeStoreLink={chromeStoreLink} />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
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

  useEffect(() => {
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

  // Global keyboard shortcuts and palette
  useEffect(() => {
    let lastG = 0;
    const handleKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }

      const isText = ['INPUT', 'TEXTAREA'].includes(tag) || e.target?.isContentEditable;
      if (isText) return;

      // ? opens the shortcut overlay. Bare key — no modifiers — and only
      // outside text inputs (already filtered above). Shift+/ on US layouts
      // gives '?'; on layouts where '?' needs another modifier, the user
      // can still discover the overlay via the topbar Cmd-K hint or the
      // CommandPalette itself.
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutOverlayOpen(true);
        return;
      }

      const now = Date.now();
      if (e.key.toLowerCase() === 'g') {
        lastG = now;
        return;
      }
      if (now - lastG < 800) {
        if (e.key.toLowerCase() === 'h') window.location.href = '/think?tab=home';
        if (e.key.toLowerCase() === 'l') window.location.href = '/library';
        if (e.key.toLowerCase() === 't') window.location.href = '/think?tab=home';
        if (e.key.toLowerCase() === 'w') window.location.href = '/wiki/workspace?view=graph';
        if (e.key.toLowerCase() === 'r') window.location.href = '/review';
        if (e.key.toLowerCase() === 's') window.location.href = '/settings';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openPalette]);

  const primaryNavItems = getPrimaryNavItems();
  const secondaryNavItems = getSecondaryNavItems();

  if (isLoading) return <RouteLoadingFallback />;

  const AppLayout = () => {
    const topBarUtilityNav = [
      {
        label: 'Connections',
        to: '/integrations',
        match: (currentLocation) => currentLocation.pathname.startsWith('/integrations')
      },
      {
        label: 'Settings',
        to: '/settings',
        match: (currentLocation) => currentLocation.pathname.startsWith('/settings')
      }
    ];
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
    const moreNavItems = secondaryNavItems;

    const routes = (
      <Page className="page-area">
        <CommandPalette open={paletteOpen} onClose={closePalette} />
        <KeyboardShortcutOverlay open={shortcutOverlayOpen} onClose={() => setShortcutOverlayOpen(false)} />
        <ProductFeedbackModal open={productFeedbackOpen} onClose={() => setProductFeedbackOpen(false)} />
        <TourManager />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/think?tab=home" replace />} />
            <Route path="/today" element={<TodayMode />} />
            <Route path="/library" element={<Library />} />
            <Route path="/think" element={<ThinkMode />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/return-queue" element={<ReturnQueue />} />
            <Route path="/review" element={<ReviewMode />} />
            <Route path="/wiki" element={<Navigate to="/wiki/workspace?view=graph" replace />} />
            <Route path="/wiki/home" element={<WikiProductIndex />} />
            <Route path="/wiki/list" element={<Navigate to="/wiki/workspace?view=list" replace />} />
            <Route path="/wiki/workspace" element={<Wiki />} />
            <Route path="/wiki/activity/:runId" element={<WikiIngestRun />} />
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
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings/connected-agents/authorize" element={<AgentConnectAuthorize />} />
            <Route path="/a/run/:taskId" element={<AgentTaskRun />} />
            <Route path="/data-integrations" element={<DataIntegrations />} />
            <Route path="/marketing-analytics" element={<MarketingAnalytics />} />
            <Route path="/search-console-opportunities" element={<SearchConsoleOpportunities />} />
            <Route path="/guides" element={<GuidesHub />} />
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
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
            <Route path="/design-preview" element={<DesignPreview />} />
            <Route path="/share/concepts/:slug" element={<SharedConcept />} />
            <Route path="/share/wiki/:idOrSlug" element={<SharedWikiPage />} />

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
          </Routes>
        </Suspense>
      </Page>
    );

    return (
      <AppShell
        brandEnergy={uiSettings.brandEnergy}
        topBar={(
          <TopBar
            brandEnergy={uiSettings.brandEnergy}
            primaryNav={primaryNavItems}
            utilityNav={topBarUtilityNav}
            secondaryNav={moreNavItems}
            searchMode="field"
            onSearchOpen={openPalette}
            theme={uiSettings.theme}
            onThemeChange={(nextTheme) => handleUiSettingsChange({ theme: nextTheme })}
            themeSaving={uiSettingsSaving}
            accountMenuItems={topBarAccountMenuItems}
            className=""
          />
        )}
      >
        {routes}
      </AppShell>
    );
  };

  return (
    <Router>
      <Analytics /> 
      {isAuthenticated ? (
        <TourProvider>
          <AppLayout />
        </TourProvider>
      ) : (
        <PublicRoutes
          chromeStoreLink={chromeStoreLink}
          handleLoginSuccess={handleLoginSuccess}
          uiSettings={uiSettings}
        />
      )}
    </Router>
  );
}

export default App;
