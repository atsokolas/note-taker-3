// note-taker-ui/src/App.js

import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom'; // Import NavLink
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList'; // Import new component
import './App.css';

const Welcome = () => <h2 className="welcome-message">Select an article to read</h2>;

function App() {
  const [articleListKey, setArticleListKey] = useState(0);

  const refreshArticleList = () => {
    setArticleListKey(prevKey => {
      console.log("[DEBUG - App.js] articleListKey changing from", prevKey, "to", prevKey + 1);
      return prevKey + 1;
    });
  };

  return (
    <Router>
      <div className="app-container">
        <div className="sidebar">
          {/* Nav Links in Sidebar */}
          <div className="sidebar-nav"> {/* New div for navigation links */}
            <NavLink to="/" className="sidebar-link" end>Your Library</NavLink>
            <NavLink to="/highlights-by-tag" className="sidebar-link">Highlights by Tag</NavLink>
          </div>

          {/* Render ArticleList or HighlightByTagList based on route */}
          <Routes>
            <Route path="/" element={<ArticleList key={articleListKey} />} />
            <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
            {/* ArticleViewer is still handled in the main content area */}
            <Route path="/articles/:id" element={<div />} /> {/* Dummy route to prevent ArticleList from rendering */}
          </Routes>
        </div>

        {/* The Main Content area will change based on the URL */}
        <div className="content-viewer">
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/highlights-by-tag" element={<Welcome />} /> {/* Show welcome for highlights view too */}
            <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
