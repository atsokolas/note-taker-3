// note-taker-ui/src/App.js
/* global chrome */
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register';
import Login from './components/Login';
import './App.css';

// A simple component for a welcome message when no article is selected
const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

// --- FIX: This component is now passed the authentication status directly ---
const PrivateRoute = ({ isAuthenticated, children }) => {
  if (!isAuthenticated) {
    // Redirect them to the login page
    return <Navigate to="/login" replace />;
  }
  return children;
};

// --- This new component contains your main app layout for when a user is logged in ---
const MainAppLayout = ({ onLogout, onArticleChange }) => (
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
        <Route path="/" element={<Welcome />} />
        <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
        <Route path="/articles/:id" element={<ArticleViewer onArticleChange={onArticleChange} />} />
        {/* If any other path is hit while logged in, redirect to home */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  </>
);

function App() {
  const [articleListKey, setArticleListKey] = useState(0);
  // --- FIX: Manage authentication state properly ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- FIX: Check chrome.storage when the app starts ---
  useEffect(() => {
    chrome.storage.local.get(['token'], function(result) {
      if (result.token) {
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    });
  }, []);

  const refreshArticleList = () => {
    setArticleListKey(prevKey => prevKey + 1);
  };

  // --- FIX: Update logout to use chrome.storage ---
  const handleLogout = () => {
    chrome.storage.local.remove('token', () => {
      setIsAuthenticated(false);
    });
  };

  if (isLoading) {
    return <div className="loading-container">Loading...</div>;
  }

  return (
    <Router>
      <div className="app-container">
        <Routes>
          {/* Public routes that are always available */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected routes are wrapped in the PrivateRoute component */}
          <Route 
            path="/*" 
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <MainAppLayout onLogout={handleLogout} onArticleChange={refreshArticleList} />
              </PrivateRoute>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

