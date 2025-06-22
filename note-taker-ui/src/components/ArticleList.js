// In note-taker-ui/src/components/ArticleList.js

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const ArticleList = () => {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchArticles = async () => {
            try {
                // Use the correct, live URL for your backend API
                const response = await axios.get('https://note-taker-3.onrender.com/get-articles');
                setArticles(response.data);
                setError(null);
            } catch (err) {
                console.error("Failed to fetch articles:", err);
                setError("Failed to load articles. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        fetchArticles();
    }, []); // The empty array ensures this runs only once when the component mounts

    if (loading) {
        return <p>Loading articles...</p>;
    }

    if (error) {
        return <p style={{ color: 'red' }}>{error}</p>;
    }

    return (
        <div>
            <h1>Saved Articles</h1>
            {articles.length > 0 ? (
                <ul>
                    {articles.map(article => (
                        <li key={article._id}>
                            {/* Link to the ArticleViewer component for each article */}
                            <Link to={`/articles/${article._id}`}>
                                {article.title}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p>No articles saved yet.</p>
            )}
        </div>
    );
};

export default ArticleList;
