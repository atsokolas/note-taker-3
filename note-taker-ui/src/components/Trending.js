// note-taker-ui/src/components/Trending.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const Trending = () => {
    const [trendingArticles, setTrendingArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchTrending = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${BASE_URL}/api/trending`);
                setTrendingArticles(response.data);
            } catch (err) {
                console.error("Error fetching trending articles:", err);
                setError("Could not load trending articles.");
            } finally {
                setLoading(false);
            }
        };

        fetchTrending();
    }, []);

    if (loading) return <p className="status-message">Loading trending articles...</p>;
    if (error) return <p className="status-message" style={{ color: 'red' }}>{error}</p>;

    return (
        <div className="trending-container">
            <h1>Top Recommended Articles</h1>
            {trendingArticles.length > 0 ? (
                <ol className="trending-list">
                    {trendingArticles.map((article, index) => (
                        <li key={index} className="trending-list-item">
                            <div className="trending-item-content">
                                <a href={article._id} target="_blank" rel="noopener noreferrer" className="trending-title-link">
                                    {article.articleTitle}
                                </a>
                                <span className="recommendation-count">
                                    {article.recommendationCount} {article.recommendationCount > 1 ? 'recommendations' : 'recommendation'}
                                </span>
                            </div>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="status-message">No articles have been recommended yet.</p>
            )}
        </div>
    );
};

export default Trending;
