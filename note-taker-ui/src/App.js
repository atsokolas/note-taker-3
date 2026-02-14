import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import Register from './components/Register';
import Login from './components/Login';
import Trending from './pages/Trending';
import Landing from './pages/Landing';
import Notebook from './pages/Notebook';
import AllHighlights from './pages/AllHighlights';
import Search from './pages/Search';
import TagBrowser from './pages/TagBrowser';
import Brain from './pages/Brain';
import Journey from './pages/Journey';
import Resurface from './pages/Resurface';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
import TagConcept from './pages/TagConcept';
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
import CommandPalette from './components/CommandPalette';
import OnboardingManager from './components/OnboardingManager';
import { fetchUiSettings, saveUiSettings } from './api/uiSettings';
import {
  applyUiSettingsToRoot,
  loadUiSettingsFromStorage,
  normalizeUiSettings,
  persistUiSettingsToStorage
} from './settings/uiPreferences';
import { Page, Card } from './components/ui';
import AppShell from './layout/AppShell';
import TopBar from './layout/TopBar';
import ThreePaneLayout from './layout/ThreePaneLayout';
import './styles/theme.css';
import './styles/tokens.css';
import './styles/global.css';
import './App.css';
import './styles/reading-layout.css';
import './styles/studio-board.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [articleListKey, setArticleListKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState(() => loadUiSettingsFromStorage());
  const [uiSettingsSaving, setUiSettingsSaving] = useState(false);

  // Your existing Chrome Store link
  const chromeStoreLink = "https://chromewebstore.google.com/detail/note-taker/bekllegjmjbnamphjnkifpijkhoiepaa?hl=en-US&utm_source=ext_sidebar";

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
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

  const refreshArticleList = () => {
    setArticleListKey(prevKey => prevKey + 1);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    // --- CHANGE: Redirect to home (Landing Page) instead of /login ---
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
    { label: 'Today', to: '/today' },
    { label: 'Library', to: '/library' },
    { label: 'Think', to: '/think' },
    { label: 'Map', to: '/map' },
    { label: 'Return Queue', to: '/return-queue' },
    { label: 'Review', to: '/review' },
    { label: 'Settings', to: '/settings' },
    { label: 'How To Use', to: '/how-to-use' }
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const AppLayout = () => {
    const location = useLocation();
    const hasSeenLanding = localStorage.getItem('hasSeenLanding') === 'true';
    const showLibraryRail = location.pathname.startsWith('/articles/');
    const isLibraryRoute = location.pathname.startsWith('/library');
    const isThinkRoute = location.pathname.startsWith('/think');
    const isReturnQueueRoute = location.pathname.startsWith('/return-queue');
    const isMapRoute = location.pathname.startsWith('/map');
    const isReviewRoute = location.pathname.startsWith('/review');
    const isTodayRoute = location.pathname.startsWith('/today');
    const leftPlaceholder = showLibraryRail ? (
      <Card>
        <div className="muted-label" style={{ marginBottom: 8 }}>Library</div>
        <ArticleList key={articleListKey} />
      </Card>
    ) : (
      <div className="muted small">Sections will live here.</div>
    );
    const rightPlaceholder = (
      <div className="muted small">Context will live here.</div>
    );

    const routes = (
      <Page className="page-area">
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <OnboardingManager />
        <Routes>
          <Route path="/" element={hasSeenLanding ? <Navigate to="/today" replace /> : <Landing />} />
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

          {/* Legacy/feature routes kept for compatibility */}
          <Route path="/brain" element={<Brain />} />
          <Route path="/resurface" element={<Resurface />} />
          <Route path="/all-highlights" element={<AllHighlights />} />
          <Route path="/tags" element={<TagBrowser />} />
          <Route path="/tags/:tagName" element={<TagConcept />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:slug" element={<CollectionDetail />} />
          <Route path="/notebook" element={<Notebook />} />
          <Route path="/views" element={<Views />} />
          <Route path="/views/:id" element={<ViewDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/journey" element={<Journey />} />
          <Route path="/concept/:tag" element={<TagConcept />} />
          <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
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
        topBar={(
          <TopBar
            navItems={navItems}
            rightSlot={(
              <>
                <a href="/how-to-use" className="topbar__button" title="How To Use">How To Use</a>
                <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer" className="topbar__button">
                  Get the Extension
                </a>
                <button className="topbar__button" onClick={handleLogout}>Logout</button>
              </>
            )}
          />
        )}
      >
        {(isLibraryRoute || isThinkRoute || isMapRoute || isReturnQueueRoute || isReviewRoute || isTodayRoute) ? (
          routes
        ) : (
          <ThreePaneLayout
            left={leftPlaceholder}
            main={routes}
            right={rightPlaceholder}
            rightTitle="Context"
            defaultLeftOpen={showLibraryRail}
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
        <AppLayout />
      ) : (
        <div className="auth-pages-container">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/register" element={<Register chromeStoreLink={chromeStoreLink} />} />
            <Route 
              path="/login" 
              element={<Login onLoginSuccess={handleLoginSuccess} chromeStoreLink={chromeStoreLink} />} 
            />
            <Route path="*" element={<Navigate to="/" replace />} /> 
          </Routes>
        </div>
      )}
    </Router>
  );
}

export default App;
