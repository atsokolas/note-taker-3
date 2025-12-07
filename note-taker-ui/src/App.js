import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import Register from './components/Register';
import Login from './components/Login';
import Trending from './pages/Trending';
import LandingPage from './components/LandingPage'; // <-- 1. IMPORT LANDING PAGE
import Notebook from './pages/Notebook';
import AllHighlights from './pages/AllHighlights';
import Search from './pages/Search';
import TagBrowser from './pages/TagBrowser';
import Brain from './pages/Brain';
import Journey from './pages/Journey';
import Collections from './pages/Collections';
import CollectionDetail from './pages/CollectionDetail';
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

  const navItems = [
    { label: 'Brain', to: '/brain' },
    { label: 'Library', to: '/library' },
    { label: 'Highlights', to: '/all-highlights' },
    { label: 'Tags', to: '/tags' },
    { label: 'Collections', to: '/collections' },
    { label: 'Notebook', to: '/notebook' },
    { label: 'Journey', to: '/journey' },
    { label: 'Trending', to: '/trending' }
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const AppLayout = () => {
    const location = useLocation();
    const showLibraryRail = location.pathname === '/' || location.pathname === '/library' || location.pathname.startsWith('/articles/');

    return (
      <div className="app-shell">
        <Sidebar
          brand="Note Taker"
          navItems={navItems}
          onLogout={handleLogout}
          footer={
            <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer" className="chrome-store-button simple-pill">
              <ChromeIcon />
              <span>Get the Extension</span>
            </a>
          }
        />

        <div className={`layout-main ${showLibraryRail ? '' : 'layout-main--single'}`}>
          {showLibraryRail && (
            <div className="library-rail">
              <Card>
                <div className="muted-label" style={{ marginBottom: 8 }}>Library</div>
                <ArticleList key={articleListKey} /> 
              </Card>
            </div>
          )}

          <Page className="page-area">
            <Routes>
              <Route path="/" element={<Welcome />} /> 
              <Route path="/library" element={<Welcome />} />
              <Route path="/brain" element={<Brain />} />
              <Route path="/all-highlights" element={<AllHighlights />} />
              <Route path="/tags" element={<TagBrowser />} />
              <Route path="/collections" element={<Collections />} />
              <Route path="/collections/:slug" element={<CollectionDetail />} />
              <Route path="/notebook" element={<Notebook />} />
              <Route path="/search" element={<Search />} />
              <Route path="/journey" element={<Journey />} />
              <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
              <Route path="/trending" element={<Trending />} />
              {/* Redirect authenticated users away from auth pages */}
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/register" element={<Navigate to="/" replace />} />
              <Route path="/journey" element={<Search />} />
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
            <Route path="/" element={<LandingPage chromeStoreLink={chromeStoreLink} />} />
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
