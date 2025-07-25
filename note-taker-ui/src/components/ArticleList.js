import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const AccordionIcon = ({ isOpen }) => (
    <svg className={`accordion-icon ${isOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ArticleList = ({ onArticleChange }) => { // onArticleChange is passed in for ArticleViewer
    const [groupedArticles, setGroupedArticles] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openFolder, setOpenFolder] = useState(null);
    const [newFolderName, setNewFolderName] = useState('');

    const fetchAndGroupArticles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const articlesResponse = await axios.get(`${BASE_URL}/get-articles`, { withCredentials: true });
            const foldersResponse = await axios.get(`${BASE_URL}/folders`, { withCredentials: true });
            
            const articlesData = articlesResponse.data;
            const foldersData = foldersResponse.data;

            const initialGroupedArticles = {};
            initialGroupedArticles['uncategorized'] = { id: 'uncategorized', name: 'Uncategorized', articles: [] };
            
            foldersData.forEach(folder => {
                initialGroupedArticles[folder._id] = { id: folder._id, name: folder.name, articles: [] };
            });

            articlesData.forEach(article => {
                const folderId = article.folder ? article.folder._id : 'uncategorized';
                if (initialGroupedArticles[folderId]) {
                    initialGroupedArticles[folderId].articles.push(article);
                } else {
                    initialGroupedArticles['uncategorized'].articles.push(article);
                }
            });

            setGroupedArticles(initialGroupedArticles);

        } catch (err) {
            setError("Failed to load articles or folders.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAndGroupArticles();
    }, [fetchAndGroupArticles]);

    const handleFolderClick = (folderId) => {
        setOpenFolder(openFolder === folderId ? null : folderId);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) {
            alert("Please enter a folder name.");
            return;
        }
        try {
            const response = await axios.post(`${BASE_URL}/folders`, { name: newFolderName.trim() }, { withCredentials: true });
            alert(`Folder "${response.data.name}" created successfully!`);
            setNewFolderName('');
            await fetchAndGroupArticles(); 
        } catch (err) {
            alert("Failed to create folder.");
        }
    };

    const handleDeleteFolder = async (folderId, folderName) => {
        if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"?`)) {
            return;
        }
        try {
            await axios.delete(`${BASE_URL}/folders/${folderId}`, { withCredentials: true });
            alert(`Folder "${folderName}" deleted successfully!`);
            await fetchAndGroupArticles(); 
        } catch (err) {
            alert("Failed to delete folder.");
        }
    };

    if (loading) return <p className="status-message">Loading articles...</p>;
    if (error) return <p className="status-message" style={{ color: 'red' }}>{error}</p>;

    const sortedFolderKeys = Object.keys(groupedArticles).sort((a, b) => {
        if (a === 'uncategorized') return -1;
        if (b === 'uncategorized') return 1;
        return groupedArticles[a].name.localeCompare(groupedArticles[b].name);
    });

    return (
        <div className="article-list-container">
            <div className="new-folder-section">
                <input
                    type="text"
                    placeholder="New folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                />
                <button onClick={handleCreateFolder}>Create</button>
            </div>
            
            {sortedFolderKeys.map(folderId => {
                const folder = groupedArticles[folderId];
                const isOpen = openFolder === folderId;

                return (
                    <div key={folderId} className="folder-group">
                        <button className="folder-header" onClick={() => handleFolderClick(folderId)}>
                            <AccordionIcon isOpen={isOpen} />
                            {folder.name}
                            {folderId !== 'uncategorized' && (
                                <span className="delete-folder-button" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folderId, folder.name);}}>
                                    &times;
                                </span>
                            )}
                        </button>

                        <ul className={`article-list nested ${isOpen ? 'open' : ''}`}>
                            {folder.articles && folder.articles.length > 0 ? (
                                folder.articles.map(article => (
                                    <li key={article._id} className="article-list-item">
                                        <NavLink to={`/articles/${article._id}`} className="article-title-link">
                                            {article.title}
                                        </NavLink>
                                    </li>
                                ))
                            ) : (
                                <li className="article-list-item"><em>No articles in this folder.</em></li>
                            )}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
};

export default ArticleList;
