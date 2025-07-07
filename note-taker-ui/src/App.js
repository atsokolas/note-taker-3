// note-taker-ui/src/App.js - UPDATED FOR ALWAYS VISIBLE ARTICLE LIST IN SIDEBAR

import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import HighlightByTagList from './components/HighlightByTagList';
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
          <div className="sidebar-nav">
            {/* The NavLink for "Your Library" can still exist for visual clarity/active state */}
            <NavLink to="/" className="sidebar-link" end>Your Library</NavLink>
            {/* Link to Highlights by Tag, now as a main content view */}
            <NavLink to="/highlights-by-tag" className="sidebar-link">Highlights by Tag</NavLink>
          </div>

          {/* ArticleList (Your Library) is now ALWAYS rendered in the sidebar */}
          <ArticleList key={articleListKey} /> 
          {/* Removed the <Routes> block from here */}
        </div>

        <div className="content-viewer">
          <Routes>
            <Route path="/" element={<Welcome />} />
            {/* If on /highlights-by-tag, show the HighlightByTagList in the main content area */}
            <Route path="/highlights-by-tag" element={<HighlightByTagList />} />
            {/* When an article is selected, show the ArticleViewer */}
            <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
