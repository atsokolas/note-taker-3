import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ArticleList from './components/ArticleList';
import ArticleViewer from './components/ArticleViewer';
import './App.css'; // Import our new, beautiful CSS

// A helper component to render a welcome message
const Welcome = () => <h2 style={{textAlign: 'center', color: '#6c757d', marginTop: '50px'}}>Select an article to read</h2>;

function App() {
  return (
    <Router>
      <div className="app-container">
        {/* The Sidebar will always be visible */}
        <div className="sidebar">
          <ArticleList />
        </div>

        {/* The Main Content area will change based on the URL */}
        <div className="content-viewer">
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/articles/:id" element={<ArticleViewer />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
