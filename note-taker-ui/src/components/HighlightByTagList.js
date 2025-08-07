import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const AccordionIcon = ({ isOpen }) => (
    <svg className={`accordion-icon ${isOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const HighlightByTagList = () => {
    const [groupedHighlights, setGroupedHighlights] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openTag, setOpenTag] = useState(null);

    const fetchAndGroupHighlights = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // --- THE FIX: Get token and create headers ---
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token not found.");
            const authHeaders = { headers: { 'Authorization': `Bearer ${token}` } };
            // ------------------------------------------
            
            const response = await axios.get(`${BASE_URL}/get-articles`, authHeaders);
            const articles = response.data;

            const highlightsByTag = articles.reduce((acc, article) => {
                if (article.highlights && Array.isArray(article.highlights)) {
                    article.highlights.forEach(highlight => {
                        const tags = highlight.tags && Array.isArray(highlight.tags) && highlight.tags.length > 0
                            ? highlight.tags
                            : ['untagged'];

                        tags.forEach(tag => {
                            const normalizedTag = tag.trim().toLowerCase();
                            if (!acc[normalizedTag]) {
                                acc[normalizedTag] = { name: tag, highlights: [] };
                            }
                            acc[normalizedTag].highlights.push({
                                ...highlight,
                                articleTitle: article.title,
                                articleUrl: article.url,
                                articleId: article._id
                            });
                        });
                    });
                }
                return acc;
            }, {});

            setGroupedHighlights(highlightsByTag);

        } catch (err) {
            console.error("❌ Failed to fetch highlights:", err);
            setError("Failed to load highlights. Please try logging in again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAndGroupHighlights();
    }, [fetchAndGroupHighlights]);

    const handleTagClick = (tagKey) => {
        setOpenTag(openTag === tagKey ? null : tagKey);
    };

    if (loading) return <p className="status-message">Loading highlights...</p>;
    if (error) return <p className="status-message" style={{ color: 'red' }}>{error}</p>;

    const sortedTagKeys = Object.keys(groupedHighlights).sort((a, b) => {
        if (a === 'untagged') return -1;
        if (b === 'untagged') return 1;
        return groupedHighlights[a].name.localeCompare(groupedHighlights[b].name);
    });

    return (
        <div className="highlight-by-tag-list-container">
            <h1>Highlights by Tag</h1>
            {sortedTagKeys.length > 0 ? (
                sortedTagKeys.map(tagKey => {
                    const tagGroup = groupedHighlights[tagKey];
                    const isOpen = openTag === tagKey;

                    return (
                        <div key={tagKey} className="tag-group">
                            <button className="tag-header" onClick={() => handleTagClick(tagKey)}>
                                <AccordionIcon isOpen={isOpen} />
                                {tagGroup.name} ({tagGroup.highlights.length})
                            </button>
                            <ul className={`highlight-list nested ${isOpen ? 'open' : ''}`}>
                                {tagGroup.highlights.map((highlight, index) => (
                                    <li key={highlight._id || `${highlight.text.substring(0,10)}-${index}`} className="highlight-list-item">
                                        <p className="highlight-text">{highlight.text}</p>
                                        {highlight.note && <p className="highlight-note">Note: {highlight.note}</p>}
                                        <NavLink to={`/articles/${highlight.articleId}`} className="highlight-article-link">
                                            From: {highlight.articleTitle}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })
            ) : (
                <p className="status-message">No highlights found yet.</p>
            )}
        </div>
    );
};

export default HighlightByTagList;
