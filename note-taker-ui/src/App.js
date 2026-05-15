import React, { Suspense, lazy, useState, useEffect } from 'react';
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
import TourProvider, { useTour } from './tour/TourProvider';
import TourManager from './tour/TourManager';
import { buildCanonicalArticlePath } from './utils/firstInsight';
import './styles/theme.css';
import './styles/tokens.css';
import './styles/global.css';
import './App.css';
import './styles/reading-layout.css';
import './styles/dashboard-refresh.css';
import './styles/think-home-polish.css';
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
const WikiIngestRun = lazy(() => import('./pages/WikiIngestRun'));
const HowToUse = lazy(() => import('./pages/HowToUse'));
const Integrations = lazy(() => import('./pages/Integrations'));
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

const RouteLoadingFallback = () => (
  <div className="page-loading" role="status" aria-live="polite">Loading...</div>
);

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
  if (!conceptName) {
    return <Navigate to="/think?tab=concepts" replace />;
  }
  return <Navigate to={`/think?tab=concepts&concept=${encodeURIComponent(conceptName)}`} replace />;
};

const LegacyArticleRedirect = () => {
  const { id } = useParams();
  return <Navigate to={buildCanonicalArticlePath(id)} replace />;
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
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false);
  const [productFeedbackOpen, setProductFeedbackOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState(() => loadUiSettingsFromStorage());
  const [uiSettingsSaving, setUiSettingsSaving] = useState(false);

  // Your existing Chrome Store link
  const chromeStoreLink = "https://chromewebstore.google.com/detail/note-taker/bekllegjmjbnamphjnkifpijkhoiepaa?hl=en-US&utm_source=ext_sidebar";

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

  // Global keyboard shortcuts and palette
  useEffect(() => {
    let lastG = 0;
    const handleKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const isText = ['INPUT', 'TEXTAREA'].includes(tag) || e.target?.isContentEditable;
      if (isText) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

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
        if (e.key.toLowerCase() === 't') window.location.href = '/today';
        if (e.key.toLowerCase() === 'b') window.location.href = '/brain';
        if (e.key.toLowerCase() === 'n') window.location.href = '/think?tab=notebook';
        if (e.key.toLowerCase() === 'j') window.location.href = '/journey';
        if (e.key.toLowerCase() === 'c') window.location.href = '/collections';
        if (e.key.toLowerCase() === 'v') window.location.href = '/views';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const primaryNavItems = [
    {
      label: 'Library',
      to: '/library',
      match: (location) => location.pathname.startsWith('/library')
    },
    {
      label: 'Notebook',
      to: '/think?tab=notebook',
      match: (location) => location.pathname.startsWith('/think') && new URLSearchParams(location.search).get('tab') === 'notebook'
    },
    {
      label: 'Concepts',
      to: '/think?tab=concepts',
      match: (location) => location.pathname.startsWith('/think') && new URLSearchParams(location.search).get('tab') === 'concepts'
    },
    {
      label: 'Questions',
      to: '/think?tab=questions',
      match: (location) => location.pathname.startsWith('/think') && new URLSearchParams(location.search).get('tab') === 'questions'
    },
    {
      label: 'Wiki',
      to: '/wiki',
      match: (location) => location.pathname.startsWith('/wiki')
    }
  ];

  const secondaryNavItems = [
    {
      label: 'Think Home',
      to: '/think?tab=home',
      match: (location) => location.pathname.startsWith('/think') && new URLSearchParams(location.search).get('tab') === 'home'
    },
    {
      label: 'Today',
      to: '/today',
      match: (location) => location.pathname.startsWith('/today')
    },
    {
      label: 'Review',
      to: '/review',
      match: (location) => location.pathname.startsWith('/review')
    },
    {
      label: 'Capture',
      to: '/data-integrations',
      match: (location) => location.pathname.startsWith('/data-integrations')
    },
    {
      label: 'Map',
      to: '/map',
      match: (location) => location.pathname.startsWith('/map')
    },
    {
      label: 'Return Queue',
      to: '/return-queue',
      match: (location) => location.pathname.startsWith('/return-queue')
    },
    {
      label: 'Growth',
      to: '/marketing-analytics',
      match: (location) => location.pathname.startsWith('/marketing-analytics') || location.pathname.startsWith('/search-console-opportunities')
    },
    {
      label: 'How To Use',
      to: '/how-to-use',
      match: (location) => location.pathname.startsWith('/how-to-use')
    }
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const AppLayout = () => {
    const location = useLocation();
    const tour = useTour();
    const locationSearch = new URLSearchParams(location.search);
    const hasSeenLanding = localStorage.getItem('hasSeenLanding') === 'true';
    const isConceptRoute = (
      location.pathname.startsWith('/think')
      && locationSearch.get('tab') === 'concepts'
    );
    const topBarUtilityNav = [
      {
        label: 'Feedback',
        onClick: () => setProductFeedbackOpen(true),
        match: () => false
      },
      {
        label: 'Growth',
        to: '/marketing-analytics',
        match: (currentLocation) => currentLocation.pathname.startsWith('/marketing-analytics') || currentLocation.pathname.startsWith('/search-console-opportunities')
      },
      {
        label: 'Settings',
        to: '/settings',
        match: (currentLocation) => currentLocation.pathname.startsWith('/settings')
      }
    ];
    const topBarAccountMenuItems = [
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

    const routes = (
      <Page className="page-area">
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <KeyboardShortcutOverlay open={shortcutOverlayOpen} onClose={() => setShortcutOverlayOpen(false)} />
        <ProductFeedbackModal open={productFeedbackOpen} onClose={() => setProductFeedbackOpen(false)} />
        <TourManager />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={hasSeenLanding ? <Navigate to="/think?tab=home" replace /> : <Landing />} />
            <Route path="/today" element={<TodayMode />} />
            <Route path="/library" element={<Library />} />
            <Route path="/think" element={<ThinkMode />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/return-queue" element={<ReturnQueue />} />
            <Route path="/review" element={<ReviewMode />} />
            <Route path="/wiki" element={<Wiki />} />
            <Route path="/wiki/list" element={<Wiki />} />
            <Route path="/wiki/workspace" element={<Wiki />} />
            <Route path="/wiki/activity/:runId" element={<WikiIngestRun />} />
            <Route path="/wiki/:id" element={<Wiki />} />
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

            {/* Legacy/feature routes kept for compatibility */}
            <Route path="/brain" element={<Navigate to="/review?tab=patterns" replace />} />
            <Route path="/resurface" element={<Navigate to="/review?tab=resurface" replace />} />
            <Route path="/all-highlights" element={<AllHighlights />} />
            <Route path="/tags" element={<TagBrowser />} />
            <Route path="/tags/:tagName" element={<LegacyConceptRedirect />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/:slug" element={<CollectionDetail />} />
            <Route path="/notebook" element={<Navigate to="/think?tab=notebook" replace />} />
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
            secondaryNav={secondaryNavItems}
            searchMode={isConceptRoute ? 'icon' : 'field'}
            theme={uiSettings.theme}
            onThemeChange={(nextTheme) => handleUiSettingsChange({ theme: nextTheme })}
            themeSaving={uiSettingsSaving}
            helpMenu={{
              onStart: () => tour.startTour(),
              onResume: () => tour.resumeTour(),
              onRestart: () => tour.restartTour(),
              canResume: tour.state.status !== 'not_started' && tour.state.status !== 'completed',
              progress: {
                completed: (tour.state.completedStepIds || []).length,
                total: tour.totalSteps,
                status: tour.state.status
              }
            }}
            accountMenuItems={topBarAccountMenuItems}
            className={isConceptRoute ? 'topbar--manuscript' : ''}
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
