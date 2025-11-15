import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react'; // <-- 1. IMPORT
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register';
import Login from './components/Login';
import Trending from './components/Trending';
import './App.css';

// ... (your ChromeIcon component)
const ChromeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* ... (svg paths) ... */}
  </svg>
);

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

function App() {
  // ... (your existing state and functions: isAuthenticated, handleLogout, etc.)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [articleListKey, setArticleListKey] = useState(0);

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
    window.location.href = '/login'; 
  };
  
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <Analytics /> {/* <-- 2. ADD THE COMPONENT HERE */}
      <div className="app-container">
        {isAuthenticated ? (
          <>
            <div className="sidebar">
              {/* ... (your existing sidebar JSX) ... */}
              <div>
                <div className="sidebar-header">
                  <h2>Note Taker</h2>
                  <button onClick={handleLogout} className="logout-button">Logout</button>
                </div>
                <div className="sidebar-nav">
                  <NavLink to="/" className="sidebar-link" end>Your Library</NavLink>
                  <NavLink to="/highlights-by-tag" className="sidebar-link">Highlights by Tag</NavLink>
                  <NavLink to="/trending" className="sidebar-link">Trending</NavLink>
                </div>
                <ArticleList key={articleListKey} /> 
              </div>
              <div className="sidebar-promo">
                <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer" className="chrome-store-button">
                  <ChromeIcon />
                  <span>Get the Extension</span>
                </a>
              </div>
            </div>
            
            <div className="content-viewer">
              {/* ... (your existing Routes) ... */}
              <Routes>
                <Route path="/" element={<Welcome />} /> 
                <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
                <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
                <Route path="/trending" element={<Trending />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/register" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </>
        ) : (
          <div className="auth-pages-container">
            {/* ... (your existing auth Routes) ... */}
            <Routes>
              <Route path="/register" element={<Register chromeStoreLink={chromeStoreLink} />} />
              <Route 
                path="/login" 
                element={<Login onLoginSuccess={handleLoginSuccess} chromeStoreLink={chromeStoreLink} />} 
              />
              <Route path="*" element={<Navigate to="/login" replace />} /> 
            </Routes>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;


