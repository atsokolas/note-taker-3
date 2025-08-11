import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register';
import Login from './components/Login';
import Trending from './components/Trending'; // --- NEW: Import the Trending component ---
import './App.css';

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [articleListKey, setArticleListKey] = useState(0);

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

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <div className="app-container">
        {isAuthenticated ? (
          <>
            <div className="sidebar">
              <div className="sidebar-header">
                <h2>Note Taker</h2>
                <button onClick={handleLogout} className="logout-button">Logout</button>
              </div>
              <div className="sidebar-nav">
                <NavLink to="/" className="sidebar-link" end>Your Library</NavLink>
                <NavLink to="/highlights-by-tag" className="sidebar-link">Highlights by Tag</NavLink>
                {/* --- NEW: Add NavLink for the Trending page --- */}
                <NavLink to="/trending" className="sidebar-link">Trending</NavLink>
              </div>
              <ArticleList key={articleListKey} /> 
            </div>
            <div className="content-viewer">
              <Routes>
                <Route path="/" element={<Welcome />} /> 
                <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
                <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
                {/* --- NEW: Add Route for the Trending page --- */}
                <Route path="/trending" element={<Trending />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/register" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </>
        ) : (
          <div className="auth-pages-container">
            <Routes>
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
              <Route path="*" element={<Navigate to="/login" replace />} /> 
            </Routes>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
