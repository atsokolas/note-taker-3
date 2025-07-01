// src/components/ArticleList.js - UPDATED WITH FOLDER GROUPING

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';

const ArticleList = () => {
    // We now manage two pieces of state: the original articles and the grouped folders
    const [groupedArticles, setGroupedArticles] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAndGroupArticles = async () => {
            try {
                const response = await axios.get('https://note-taker-3-unrg.onrender.com/get-articles');
                
                // --- THIS IS THE NEW LOGIC ---
                // This function takes the flat array of articles and groups them by folder
                const articlesByFolder = response.data.reduce((acc, article) => {
                    // Use "Uncategorized" as the key if an article has no folder
                    const folderName = article.folder ? article.folder.name : 'Uncategorized';
                    
                    if (!acc[folderName]) {
                        acc[folderName] = []; // Create an array for this folder if it doesn't exist
                    }
                    
                    acc[folderName].push(article); // Add the article to its folder's array
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

    if (loading) {
        return <p className="status-message">Loading articles...</p>;
    }

    if (error) {
        return <p className="status-message" style={{ color: 'red' }}>{error}</p>;
    }

    // --- UPDATED RENDER LOGIC ---
    // Now we map over the grouped object instead of the flat array
    return (
        <>
            <h1>Your Library</h1>
            {Object.keys(groupedArticles).length > 0 ? (
                // Object.keys gives us an array of folder names ['Tech', 'Recipes', 'Uncategorized']
                Object.keys(groupedArticles).map(folderName => (
                    <div key={folderName} className="folder-group">
                        <h2>{folderName}</h2>
                        <ul className="article-list">
                            {/* Then we map over the articles within that specific folder */}
                            {groupedArticles[folderName].map(article => (
                                <li key={article._id} className="article-list-item">
                                    <NavLink to={`/articles/${article._id}`}>
                                        {article.title}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            ) : (
                <p className="status-message">No articles saved yet.</p>
            )}
        </>
    );
};

export default ArticleList;
