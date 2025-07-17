import React, { useState, useEffect } from 'react';
// Use BrowserRouter for the web app, but this is handled by the build.
// The MemoryRouter in the old extension code is not needed here.
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import axios from 'axios';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register';
import Login from './components/Login';
import './App.css';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

// This component contains your main app layout for when a user is logged in
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
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  </>
);

function App() {
  const [articleListKey, setArticleListKey] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // When the app starts, verify the user's session with the server
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        // We can ping any protected route. If it succeeds, the user is logged in.
        await axios.get(`${BASE_URL}/folders`, { withCredentials: true });
        setIsAuthenticated(true);
      } catch (error) {
        // If it fails (e.g., 401 Unauthorized), the user is not logged in.
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
    <Router>
      <div className="app-container">
        {isAuthenticated ? (
          <MainAppLayout onLogout={handleLogout} onArticleChange={refreshArticleList} />
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
    </Router>
  );
}

export default App;
