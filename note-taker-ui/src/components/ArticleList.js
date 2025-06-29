import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom'; // Changed from Link to NavLink
import axios from 'axios';

const ArticleList = () => {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchArticles = async () => {
            try {
                const response = await axios.get('https://note-taker-3-unrg.onrender.com/get-articles');
                setArticles(response.data);
                setError(null);
            } catch (err) {
                console.error("Failed to fetch articles:", err);
                setError("Failed to load articles.");
            } finally {
                setLoading(false);
            }
        };
        fetchArticles();
    }, []);

    if (loading) {
        return <p className="status-message">Loading articles...</p>;
    }

    if (error) {
        return <p className="status-message" style={{ color: 'red' }}>{error}</p>;
    }

    return (
        <>
            <h1>Saved Articles</h1>
            {articles.length > 0 ? (
                <ul className="article-list">
                    {articles.map(article => (
                        <li key={article._id} className="article-list-item">
                            <NavLink to={`/articles/${article._id}`}>
                                {article.title}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="status-message">No articles saved yet.</p>
            )}
        </>
    );
};

export default ArticleList;
