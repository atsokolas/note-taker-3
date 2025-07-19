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

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

// This is the new, simplified layout component for the popup
const MainAppLayout = ({ onLogout }) => (
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

// This component contains all the main logic
const AppContent = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'extension') {
      document.body.classList.add('extension-mode');
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

  // This is the updated return block you requested
  return (
    <div className="app-container">
      {isAuthenticated ? (
        <MainAppLayout onLogout={handleLogout} />
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

// The main App component just sets up the Router
function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
