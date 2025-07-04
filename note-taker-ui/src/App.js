import React, { useState } from 'react'; // Import useState
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import './App.css'; 

const Welcome = () => <h2 style={{textAlign: 'center', color: '#6c757d', marginTop: '50px'}}>Select an article to read</h2>;

function App() {
  // NEW: State for refreshing ArticleList
  const [articleListKey, setArticleListKey] = useState(0);

  // NEW: Function to increment the key, passed to ArticleViewer as a prop
  const refreshArticleList = () => {
    setArticleListKey(prevKey => prevKey + 1);
  };

  return (
    <Router>
      <div className="app-container">
        {/* The Sidebar will always be visible */}
        <div className="sidebar">
          {/* Pass the key to ArticleList. When key changes, ArticleList will remount */}
          <ArticleList key={articleListKey} /> 
        </div>

        {/* The Main Content area will change based on the URL */}
        <div className="content-viewer">
          <Routes>
            <Route path="/" element={<Welcome />} />
            {/* Pass refreshArticleList as a prop to ArticleViewer */}
            <Route path="/articles/:id" element={<ArticleViewer onArticleChange={refreshArticleList} />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
