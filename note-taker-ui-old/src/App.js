/* global chrome */
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register';
import Login from './components/Login';
import SaveArticle from './components/SaveArticle';
import './App.css';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

// Layout for the full-screen Web Application
const WebAppLayout = ({ onLogout, onArticleChange }) => (
  <>
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Note Taker</h2>
        <button onClick={onLogout} className="logout-button">Logout</button>
      </div>
      <div className="sidebar-nav">
        <NavLink to="/" className="sidebar-link" end>Your Library</NavLink>
        <NavLink to="/highlights-by-tag" className="sidebar-link">Highlights by Tag</NavLink>
      </div>
      <ArticleList key={onArticleChange} />
    </div>
    <div className="content-viewer">
      <Routes>
        <Route path="/" element={<h2 className="welcome-message">Select an article to read</h2>} />
        <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
        <Route path="/articles/:id" element={<ArticleViewer onArticleChange={onArticleChange} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  </>
);

// Layout for the compact Extension Popup
const ExtensionPopupLayout = ({ onLogout }) => (
  <div className="popup-container">
    <header className="popup-header">
      <h2>Note Taker</h2>
      <button onClick={onLogout} className="logout-button">Logout</button>
    </header>
    <hr className="popup-divider" />
    <main>
      <SaveArticle />
    </main>
  </div>
);

// This component contains all the logic
const AppContent = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtension, setIsExtension] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'extension') {
      document.body.classList.add('extension-mode');
      setIsExtension(true);
    }
  }, [location.search]);

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        await axios.get(`${BASE_URL}/folders`, { withCredentials: true });
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    verifyAuth();
  }, []);

  const handleLoginSuccess = () => setIsAuthenticated(true);
  const handleLogout = async () => {
    // ... (logout logic)
  };
  const refreshArticleList = () => { /* ... */ };

  if (isLoading) {
    return <div className="loading-container">Loading...</div>;
  }

  return (
    <div className="app-container">
      {isAuthenticated ? (
        isExtension ? <ExtensionPopupLayout onLogout={handleLogout} /> : <WebAppLayout onLogout={handleLogout} onArticleChange={refreshArticleList} />
      ) : (
        <div className="auth-pages-container">
          <Routes>
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </div>
      )}
    </div>
  );
};

function App() {
  // Use BrowserRouter for the web app. React Router is smart enough to handle
  // the extension environment when loaded from a file URL.
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
