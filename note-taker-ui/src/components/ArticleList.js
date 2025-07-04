import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const AccordionIcon = ({ isOpen }) => (
    <svg className={`accordion-icon ${isOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ArticleList = () => {
    const [groupedArticles, setGroupedArticles] = useState({});
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openFolder, setOpenFolder] = useState(null);
    const [newFolderName, setNewFolderName] = useState('');

    const fetchAndGroupArticles = useCallback(async () => {
        console.log("[DEBUG - ArticleList.js] fetchAndGroupArticles triggered."); // Add this
        setLoading(true);
        setError(null);
        try {
            const articlesResponse = await axios.get(`${BASE_URL}/get-articles`);
            const foldersResponse = await axios.get(`${BASE_URL}/folders`);
            
            const articlesData = articlesResponse.data;
            const foldersData = foldersResponse.data;

            console.log("[DEBUG - ArticleList.js] Raw articles fetched:", articlesData); 
            console.log("[DEBUG - ArticleList.js] Raw folders fetched:", foldersData); 

            setFolders(foldersData); 

            const articlesByFolder = articlesData.reduce((acc, article) => {
                const folderName = article.folder ? article.folder.name : 'Uncategorized';
                const folderId = article.folder ? article.folder._id : 'uncategorized';
                
                if (!acc[folderId]) {
                    acc[folderId] = { id: folderId, name: folderName, articles: [] };
                }
                
                acc[folderId].articles.push(article);
                return acc;
            }, {});

            console.log("[DEBUG - ArticleList.js] Grouped articles after reduction:", articlesByFolder);

            setGroupedArticles(prevGroupedArticles => {
                console.log("[DEBUG - ArticleList.js] Calling setGroupedArticles."); // Add this
                // Force a new object reference if content is identical, but it should be new anyway from reduce.
                return { ...articlesByFolder }; 
            });

        } catch (err) {
            console.error("Failed to fetch articles or folders:", err);
            setError("Failed to load articles or folders.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        console.log("[DEBUG - ArticleList.js] useEffect running, calling fetchAndGroupArticles."); // Add this
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
        console.log(`[DEBUG - ArticleList.js] Attempting to create folder: ${newFolderName.trim()}`); // Add this
        try {
            const response = await axios.post(`${BASE_URL}/folders`, { name: newFolderName.trim() });
            alert(`Folder "${response.data.name}" created successfully!`);
            setNewFolderName('');
            console.log("[DEBUG - ArticleList.js] Calling fetchAndGroupArticles after folder creation."); // Add this
            await fetchAndGroupArticles(); 
        } catch (err) {
            console.error("Error creating folder:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error creating folder: ${err.response.data.error}`);
            } else {
                alert("Failed to create folder.");
            }
        }
    };

    const handleDeleteFolder = async (folderId, folderName) => {
        if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"? All articles in it must be moved first.`)) {
            return;
        }
        console.log(`[DEBUG - ArticleList.js] Attempting to delete folder: ${folderName} (${folderId})`); // Add this
        try {
            await axios.delete(`${BASE_URL}/folders/${folderId}`);
            alert(`Folder "${folderName}" deleted successfully!`);
            if (openFolder === folderId) {
                setOpenFolder(null);
            }
            console.log("[DEBUG - ArticleList.js] Calling fetchAndGroupArticles after folder deletion."); // Add this
            await fetchAndGroupArticles(); 
        } catch (err) {
            console.error("Error deleting folder:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error deleting folder: ${err.response.data.error}`);
            } else {
                alert("Failed to delete folder.");
            }
        }
    };

    if (loading) return <p className="status-message">Loading articles...</p>;
    if (error) return <p className="status-message" style={{ color: 'red' }}>{error}</p>;

    const allFoldersIncludingUncategorized = [
        { _id: 'uncategorized', name: 'Uncategorized' },
        ...folders.filter(f => f.name !== 'Uncategorized') 
    ];

    return (
        <>
            <h1>Your Library</h1>
            <div className="new-folder-section">
                <input
                    type="text"
                    placeholder="New folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                />
                <button onClick={handleCreateFolder}>Create Folder</button>
            </div>
            
            {Object.keys(groupedArticles).length > 0 ? (
                Object.keys(groupedArticles).map(folderId => {
                    const folder = groupedArticles[folderId];
                    const isOpen = openFolder === folderId;

                    return (
                        <div key={folderId} className="folder-group">
                            <button className="folder-header" onClick={() => handleFolderClick(folderId)}>
                                <AccordionIcon isOpen={isOpen} />
                                {folder.name}
                                {folderId !== 'uncategorized' && (
                                    <span 
                                        className="delete-folder-button" 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            handleDeleteFolder(folderId, folder.name);
                                        }}
                                        title="Delete Folder"
                                    >
                                        &times;
                                    </span>
                                )}
                            </button>

                            <ul className={`article-list nested ${isOpen ? 'open' : ''}`}>
                                {folder.articles.map(article => (
                                    <li key={article._id} className="article-list-item">
                                        <NavLink to={`/articles/${article._id}`} className="article-title-link">
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
