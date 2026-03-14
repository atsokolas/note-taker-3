import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import Register from './components/Register';
import Login from './components/Login';
import Trending from './pages/Trending';
import Landing from './pages/Landing';
import AllHighlights from './pages/AllHighlights';
import Search from './pages/Search';
import TagBrowser from './pages/TagBrowser';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import Views from './pages/Views';
import ViewDetail from './pages/ViewDetail';
import Export from './pages/Export';
import TodayMode from './pages/TodayMode';
import Library from './pages/Library';
import ThinkMode from './pages/ThinkMode';
import MapView from './pages/MapView';
import ReviewMode from './pages/ReviewMode';
import ReturnQueue from './pages/ReturnQueue';
import Settings from './pages/Settings';
import HowToUse from './pages/HowToUse';
import Integrations from './pages/Integrations';
import DataIntegrations from './pages/DataIntegrations';
import CommandPalette from './components/CommandPalette';
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
import ThreePaneLayout from './layout/ThreePaneLayout';
import LeftNav from './layout/LeftNav';
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
import './styles/brand-energy.css';
import './styles/calm-ui-global.css';
import './styles/think-calm-d3a.css';
import './styles/calm-ui-system.css';

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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState(() => loadUiSettingsFromStorage());
  const [uiSettingsSaving, setUiSettingsSaving] = useState(false);

  // Your existing Chrome Store link
  const chromeStoreLink = "https://chromewebstore.google.com/detail/note-taker/bekllegjmjbnamphjnkifpijkhoiepaa?hl=en-US&utm_source=ext_sidebar";

  useEffect(() => {
    if (hasUsableStoredToken()) {
      setIsAuthenticated(true);
    } else {
      clearStoredTokens();
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    document.body.classList.add('calm-ui-global');
    return () => {
      document.body.classList.remove('calm-ui-global');
    };
  }, []);

  useEffect(() => {
    const normalized = applyUiSettingsToRoot(document.documentElement, uiSettings);
    persistUiSettingsToStorage(normalized);
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

  const navItems = [
    { label: 'Think', to: '/think' },
    { label: 'Library', to: '/library' },
    { label: 'Capture', to: '/data-integrations' },
    { label: 'Map', to: '/map' },
    { label: 'Return Queue', to: '/return-queue' },
    { label: 'Review', to: '/review' },
    { label: 'Settings', to: '/settings' },
    { label: 'Today', to: '/today' },
    { label: 'How To Use', to: '/how-to-use' }
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const AppLayout = () => {
    const location = useLocation();
    const tour = useTour();
    const hasSeenLanding = localStorage.getItem('hasSeenLanding') === 'true';
    const isLibraryRoute = location.pathname.startsWith('/library');
    const isThinkRoute = location.pathname.startsWith('/think');
    const isReturnQueueRoute = location.pathname.startsWith('/return-queue');
    const isMapRoute = location.pathname.startsWith('/map');
    const isReviewRoute = location.pathname.startsWith('/review');
    const isTodayRoute = location.pathname.startsWith('/today');
    const isLegacyRedirectRoute = (
      location.pathname.startsWith('/articles/')
      || location.pathname === '/journey'
      || location.pathname === '/resurface'
      || location.pathname === '/brain'
      || location.pathname === '/notebook'
    );
    const leftPlaceholder = (
      <div className="muted small">Sections will live here.</div>
    );
    const rightPlaceholder = (
      <div className="muted small">Context will live here.</div>
    );

    const routes = (
      <Page className="page-area">
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <TourManager />
        <Routes>
          <Route path="/" element={hasSeenLanding ? <Navigate to="/think?tab=home" replace /> : <Landing />} />
          <Route path="/today" element={<TodayMode />} />
          <Route path="/library" element={<Library />} />
          <Route path="/think" element={<ThinkMode />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/return-queue" element={<ReturnQueue />} />
          <Route path="/review" element={<ReviewMode />} />
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
      </Page>
    );

    return (
      <AppShell
        brandEnergy={uiSettings.brandEnergy}
        leftNav={<LeftNav items={navItems} />}
        topBar={(
          <TopBar
            brandEnergy={uiSettings.brandEnergy}
            helpMenu={{
              onStart: () => tour.startTour(),
              onResume: () => tour.resumeTour(),
              onRestart: () => tour.restartTour(),
              canResume: tour.state.status !== 'not_started' && tour.state.status !== 'completed'
            }}
            rightSlot={(
              <>
                <a
                  href={chromeStoreLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="topbar__button"
                  data-tour-anchor="install-extension"
                >
                  Chrome Extension (Optional)
                </a>
                <a href="/settings" className="topbar__button" title="Profile and settings">
                  Profile
                </a>
                <button className="topbar__button" onClick={handleLogout}>Logout</button>
              </>
            )}
          />
        )}
      >
        {(isLibraryRoute || isThinkRoute || isMapRoute || isReturnQueueRoute || isReviewRoute || isTodayRoute || isLegacyRedirectRoute) ? (
          routes
        ) : (
          <ThreePaneLayout
            left={leftPlaceholder}
            main={routes}
            right={rightPlaceholder}
            rightTitle="Context"
            defaultLeftOpen={false}
            defaultRightOpen={false}
            rightToggleLabel="Context"
          />
        )}
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
        <div className="auth-pages-container">
          <Routes>
            <Route path="/" element={<Landing />} />
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
        </div>
      )}
    </Router>
  );
}

export default App;
