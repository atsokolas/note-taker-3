import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ArticleList from "./components/ArticleList";
import ArticleViewer from "./components/ArticleViewer";

function App() {
    return (
        <Router>
            <Routes>
                {/* Main page shows the list of articles */}
                <Route path="/" element={<ArticleList />} />

                {/* Detail page shows a single article by its ID */}
                <Route path="/articles/:id" element={<ArticleViewer />} />
            </Routes>
        </Router>
    )
}

export default App;