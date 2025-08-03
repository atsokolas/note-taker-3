import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register';
import Login from './components/Login';
import './App.css';

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

function App() {
  // Use state to manage authentication status
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [articleListKey, setArticleListKey] = useState(0);

  // Check for token in localStorage only once when the app loads
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false); // Finished checking, stop loading
  }, []);

  const refreshArticleList = () => {
    setArticleListKey(prevKey => prevKey + 1);
  };

  // This function will be passed to the Login component
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false); // Update state to trigger re-render
  };

  // Don't render anything until we have checked for the token
  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <div className="app-container">
        {isAuthenticated ? (
          // Authenticated View
          <>
            <div className="sidebar">
              <div className="sidebar-header">
                <h2>Note Taker</h2>
                <button onClick={handleLogout} className="logout-button">Logout</button>
              </div>
              <div className="sidebar-nav">
                <NavLink to="/" className="sidebar-link" end>Your Library</NavLink>
                <NavLink to="/highlights-by-tag" className="sidebar-link">Highlights by Tag</NavLink>
              </div>
              <ArticleList key={articleListKey} /> 
            </div>
            <div className="content-viewer">
              <Routes>
                <Route path="/" element={<Welcome />} /> 
                <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
                <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
                {/* If authenticated, redirect any auth pages back to home */}
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/register" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </>
        ) : (
          // Unauthenticated View
          <div className="auth-pages-container">
            <Routes>
              <Route path="/register" element={<Register />} />
              {/* Pass the handleLoginSuccess function to the Login component */}
              <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
              {/* Redirect any other path to the login page */}
              <Route path="*" element={<Navigate to="/login" replace />} /> 
            </Routes>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
