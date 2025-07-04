import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';

// A new, reusable component for the expand/collapse icon
const AccordionIcon = ({ isOpen }) => (
    <svg className={`accordion-icon ${isOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ArticleList = () => {
    const [groupedArticles, setGroupedArticles] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // NEW: State to track which folder is currently open
    const [openFolder, setOpenFolder] = useState(null);

    useEffect(() => {
        const fetchAndGroupArticles = async () => {
            try {
                const response = await axios.get('https://note-taker-3-unrg.onrender.com/get-articles');
                
                const articlesByFolder = response.data.reduce((acc, article) => {
                    const folderName = article.folder ? article.folder.name : 'Uncategorized';
                    // Use a unique ID for the key; 'uncategorized' for articles without a folder
                    const folderId = article.folder ? article.folder._id : 'uncategorized';
                    
                    if (!acc[folderId]) {
                        acc[folderId] = { name: folderName, articles: [] };
                    }
                    
                    acc[folderId].articles.push(article);
                    return acc;
                }, {});

                setGroupedArticles(articlesByFolder);
                setError(null);

            } catch (err) {
                console.error("Failed to fetch articles:", err);
                setError("Failed to load articles.");
            } finally {
                setLoading(false);
            }
        };

        fetchAndGroupArticles();
    }, []);

    // NEW: Function to handle clicking on a folder header
    const handleFolderClick = (folderId) => {
        // If the clicked folder is already open, close it by setting state to null.
        // Otherwise, open the clicked folder.
        setOpenFolder(openFolder === folderId ? null : folderId);
    };

    if (loading) return <p className="status-message">Loading articles...</p>;
    if (error) return <p className="status-message" style={{ color: 'red' }}>{error}</p>;

    return (
        <>
            <h1>Your Library</h1>
            {Object.keys(groupedArticles).length > 0 ? (
                Object.keys(groupedArticles).map(folderId => {
                    const folder = groupedArticles[folderId];
                    // Check if this folder is the currently open one
                    const isOpen = openFolder === folderId;

                    return (
                        <div key={folderId} className="folder-group">
                            {/* Make the folder header a clickable button */}
                            <button className="folder-header" onClick={() => handleFolderClick(folderId)}>
                                <AccordionIcon isOpen={isOpen} />
                                {folder.name}
                            </button>

                            {/* Conditionally apply the 'open' class to the article list for CSS animation */}
                            <ul className={`article-list nested ${isOpen ? 'open' : ''}`}>
                                {folder.articles.map(article => (
                                    <li key={article._id} className="article-list-item">
                                        <NavLink to={`/articles/${article._id}`}>
                                            {article.title}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })
            ) : (
                <p className="status-message">No articles saved yet.</p>
            )}
        </>
    );
};

export default ArticleList;
