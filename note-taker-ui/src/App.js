/* global chrome */
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register';
import Login from './components/Login';
import SaveArticle from './components/SaveArticle'; // Make sure this component exists
import './App.css';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

const MainAppLayout = ({ onLogout, onArticleChange, isExtension }) => (
  <>
    {/* This is the full sidebar for the web app */}
    {!isExtension && (
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
    )}

    <div className="content-viewer">
      {/* The extension gets a simplified view, the web app gets the full router */}
      {isExtension ? (
        <div className="extension-view">
          <div className="sidebar-header">
            <h2>Note Taker</h2>
            <button onClick={onLogout} className="logout-button">Logout</button>
          </div>
          <hr className="sidebar-divider" />
          <SaveArticle />
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
          <Route path="/articles/:id" element={<ArticleViewer onArticleChange={onArticleChange} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      )}
    </div>
  </>
);


function App() {
  const [articleListKey, setArticleListKey] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtension, setIsExtension] = useState(false);

  // We need to wrap the main logic in a component that's inside the Router
  // to get access to the useLocation hook.
  const AppContent = () => {
    const location = useLocation();

    // This useEffect checks for the "?mode=extension" tag in the URL
    useEffect(() => {
      const params = new URLSearchParams(location.search);
      if (params.get('mode') === 'extension') {
        document.body.classList.add('extension-mode');
        setIsExtension(true);
      }
    }, [location.search]);

    // When the app starts, verify the user's session with the server
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

    const refreshArticleList = () => {
      setArticleListKey(prevKey => prevKey + 1);
    };
    
    const handleLoginSuccess = () => {
      setIsAuthenticated(true);
    };

    const handleLogout = async () => {
      try {
        await axios.post(`${BASE_URL}/api/auth/logout`, {}, { withCredentials: true });
      } catch (error) {
        console.error("Logout failed", error);
      }
      setIsAuthenticated(false);
    };

    if (isLoading) {
      return <div className="loading-container">Loading...</div>;
    }

    return (
      <div className="app-container">
        {isAuthenticated ? (
          <MainAppLayout onLogout={handleLogout} onArticleChange={refreshArticleList} isExtension={isExtension} />
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

  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
