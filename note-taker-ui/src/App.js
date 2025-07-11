// note-taker-ui/src/App.js - UPDATED FOR AUTH ROUTES

import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate } from 'react-router-dom'; // Import useNavigate
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
import Register from './components/Register'; // Import Register component
import Login from './components/Login';       // Import Login component
import './App.css';

// A simple component for a welcome message when no article is selected
const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

// Placeholder for protected route logic (will be enhanced with AuthContext later)
const PrivateRoute = ({ children }) => {
  const navigate = useNavigate();
  // For now, a very basic check. We'll improve this with context.
  const isAuthenticated = localStorage.getItem('token'); 

  if (!isAuthenticated) {
    // Redirect them to the login page, but save the current location they were trying to go to
    return <Navigate to="/login" replace />; 
  }
  return children;
};


function App() {
  const [articleListKey, setArticleListKey] = useState(0);

  const refreshArticleList = () => {
    setArticleListKey(prevKey => {
      console.log("[DEBUG - App.js] articleListKey changing from", prevKey, "to", prevKey + 1);
      return prevKey + 1;
    });
  };

  // Basic check for logged in state for header/sidebar visibility
  const isAuthenticated = localStorage.getItem('token'); 

  // Function to handle logout
  const handleLogout = () => {
    localStorage.removeItem('token'); // Remove the token
    // Optionally remove other user-related data
    refreshArticleList(); // Refresh list to reflect no data
    window.location.href = '/login'; // Redirect to login page and force a full reload
  };


  return (
    <Router>
      <div className="app-container">
        {/* Only show header and sidebar if authenticated */}
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
              </div>
              <ArticleList key={articleListKey} /> 
            </div>

            <div className="content-viewer">
              <Routes>
                {/* Protected Routes */}
                <Route path="/" element={<Welcome />} /> 
                <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
                <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
              </Routes>
            </div>
          </>
        ) : (
          // If not authenticated, only show login/register routes
          <div className="auth-pages-container"> {/* New container for auth pages */}
            <Routes>
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              {/* Redirect any other path to login if not authenticated */}
              <Route path="*" element={<Login />} /> 
            </Routes>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
