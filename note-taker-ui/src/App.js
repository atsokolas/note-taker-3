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
import Today from './pages/Today';
import Export from './pages/Export';
import TodayMode from './pages/TodayMode';
import Library from './pages/Library';
import ThinkMode from './pages/ThinkMode';
import ReviewMode from './pages/ReviewMode';
import Settings from './pages/Settings';
import HowToUse from './pages/HowToUse';
import CommandPalette from './components/CommandPalette';
import OnboardingManager from './components/OnboardingManager';
import { Page, Card, Sidebar } from './components/ui';
import './styles/theme.css';
import './App.css';

const ChromeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 2V5" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 19V22" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 12L19 12" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 12L2 12" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M19.0711 4.92896L16.9497 7.05029" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7.05029 16.9497L4.92896 19.0711" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M19.0711 19.0711L16.9497 16.9497" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7.05029 7.05029L4.92896 4.92896" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [articleListKey, setArticleListKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Your existing Chrome Store link
  const chromeStoreLink = "https://chromewebstore.google.com/detail/note-taker/bekllegjmjbnamphjnkifpijkhoiepaa?hl=en-US&utm_source=ext_sidebar";

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

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
        if (e.key.toLowerCase() === 'n') window.location.href = '/notebook';
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
    { label: 'Review', to: '/review' },
    { label: 'How To Use', to: '/how-to-use' },
    { label: 'Settings', to: '/settings' }
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const AppLayout = () => {
    const location = useLocation();
    const hasSeenLanding = localStorage.getItem('hasSeenLanding') === 'true';
    const showLibraryRail = location.pathname.startsWith('/articles/');

    return (
      <div className="app-shell">
        <Sidebar
          brand="Note Taker"
          navItems={navItems}
          onLogout={handleLogout}
          footer={(
            <div className="sidebar-footer-stack">
              <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer" className="chrome-store-button simple-pill">
                <ChromeIcon />
                <span>Get the Extension</span>
              </a>
              <a href="/how-to-use" className="sidebar-help-link" title="How To Use">
                <span className="sidebar-help-icon">?</span>
              </a>
            </div>
          )}
        />

        <div className={`layout-main ${showLibraryRail ? '' : 'layout-main--single'}`}>
          {showLibraryRail && (
            <div className="library-rail" data-onboard-id="article-list">
              <Card>
                <div className="muted-label" style={{ marginBottom: 8 }}>Library</div>
                <ArticleList key={articleListKey} /> 
              </Card>
            </div>
          )}

          <Page className="page-area">
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <OnboardingManager />
            <Routes>
              <Route path="/" element={hasSeenLanding ? <Navigate to="/today" replace /> : <Landing />} />
              <Route path="/today" element={<TodayMode />} />
              <Route path="/library" element={<Library />} />
              <Route path="/think" element={<ThinkMode />} />
              <Route path="/review" element={<ReviewMode />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/how-to-use" element={<HowToUse />} />

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
        </div>
      </div>
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
