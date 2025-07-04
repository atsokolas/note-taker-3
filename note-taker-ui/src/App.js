import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import './App.css'; 

const Welcome = () => <h2 style={{textAlign: 'center', color: '#6c757d', marginTop: '50px'}}>Select an article to read</h2>;

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
          {/* This key forces ArticleList to remount when articleListKey changes */}
          <ArticleList key={articleListKey} /> 
        </div>

        <div className="content-viewer">
          <Routes>
            <Route path="/" element={<Welcome />} />
            {/* Pass refreshArticleList to ArticleViewer */}
            <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
