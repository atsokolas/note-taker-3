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

    // useCallback for fetchAndGroupArticles to optimize performance and prevent unnecessary re-runs
    const fetchAndGroupArticles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const articlesResponse = await axios.get(`${BASE_URL}/get-articles`);
            const foldersResponse = await axios.get(`${BASE_URL}/folders`);
            
            const articlesData = articlesResponse.data;
            const foldersData = foldersResponse.data;

            console.log("[DEBUG] Raw articles fetched for grouping:", articlesData); 
            console.log("[DEBUG] Raw folders fetched for grouping:", foldersData); 

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

            console.log("[DEBUG] Grouped articles after reduction:", articlesByFolder);

            // Using a functional update with a spread to guarantee a new object reference
            // This strongly signals React to re-render.
            setGroupedArticles(prevGroupedArticles => ({ ...articlesByFolder })); 

        } catch (err) {
            console.error("Failed to fetch articles or folders:", err);
            setError("Failed to load articles or folders.");
        } finally {
            setLoading(false);
        }
    }, []); // Dependencies for useCallback. Empty means it only creates once.

    // useEffect to run fetchAndGroupArticles on component mount
    useEffect(() => {
        fetchAndGroupArticles();
    }, [fetchAndGroupArticles]); // Dependency on fetchAndGroupArticles (due to useCallback)

    // Function to handle clicking on a folder header (accordion toggle)
    const handleFolderClick = (folderId) => {
        setOpenFolder(openFolder === folderId ? null : folderId);
    };

    // Handle Create Folder
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) {
            alert("Please enter a folder name.");
            return;
        }
        try {
            const response = await axios.post(`${BASE_URL}/folders`, { name: newFolderName.trim() });
            alert(`Folder "${response.data.name}" created successfully!`);
            setNewFolderName('');
            await fetchAndGroupArticles(); // Re-fetch to update list with new folder
        } catch (err) {
            console.error("Error creating folder:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error creating folder: ${err.response.data.error}`);
            } else {
                alert("Failed to create folder.");
            }
        }
    };

    // Handle Delete Folder
    const handleDeleteFolder = async (folderId, folderName) => {
        if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"? All articles in it must be moved first.`)) {
            return;
        }
        try {
            await axios.delete(`${BASE_URL}/folders/${folderId}`);
            alert(`Folder "${folderName}" deleted successfully!`);
            // If the deleted folder was open, close it
            if (openFolder === folderId) {
                setOpenFolder(null);
            }
            await fetchAndGroupArticles(); // Re-fetch to update list without deleted folder
        } catch (err) {
            console.error("Error deleting folder:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error deleting folder: ${err.response.data.error}`);
            } else {
                alert("Failed to delete folder.");
            }
        }
    };

    // Handle Delete Article (for actions within the list)
    const handleDeleteArticle = async (articleId, articleTitle) => {
        if (!window.confirm(`Are you sure you want to delete "${articleTitle}"?`)) {
            return;
        }
        try {
            await axios.delete(`${BASE_URL}/articles/${articleId}`);
            alert(`Article "${articleTitle}" deleted successfully!`);
            await fetchAndGroupArticles(); // Re-fetch to update list without deleted article
        } catch (err) {
            console.error("Error deleting article:", err);
            alert("Failed to delete article.");
        }
    };

    // Handle Move Article (for actions within the list)
    const handleMoveArticle = async (articleId, newFolderId) => {
        console.log(`[DEBUG] Attempting to move article ${articleId} to folder ${newFolderId}`); 
        try {
            const response = await axios.patch(`${BASE_URL}/articles/${articleId}/move`, { folderId: newFolderId });
            console.log("[DEBUG] Backend response for move:", response.data); 
            alert("Article moved successfully!");
            await fetchAndGroupArticles(); // Re-fetch to update the list and show article in new folder
            console.log("[DEBUG] fetchAndGroupArticles called after move.");
        } catch (err) {
            console.error("Error moving article:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error moving article: ${err.response.data.error}`);
            } else {
                alert("Failed to move article.");
            }
        }
    };

    if (loading) return <p className="status-message">Loading articles...</p>;
    if (error) return <p className="status-message" style={{ color: 'red' }}>{error}</p>;

    // Prepare folder options for the "Move To" dropdown
    const allFoldersIncludingUncategorized = [
        { _id: 'uncategorized', name: 'Uncategorized' },
        ...folders.filter(f => f.name !== 'Uncategorized') // Ensure 'Uncategorized' is unique if it exists as a real folder
    ];

    return (
        <>
            <h1>Your Library</h1>
            {/* New Folder Creation Section */}
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
            
            {/* Render Folders and their Articles */}
            {Object.keys(groupedArticles).length > 0 ? (
                Object.keys(groupedArticles).map(folderId => {
                    const folder = groupedArticles[folderId];
                    const isOpen = openFolder === folderId;

                    return (
                        <div key={folderId} className="folder-group">
                            {/* Folder Header (clickable for accordion) */}
                            <button className="folder-header" onClick={() => handleFolderClick(folderId)}>
                                <AccordionIcon isOpen={isOpen} />
                                {folder.name}
                                {/* Delete Folder Button (only for non-uncategorized folders) */}
                                {folderId !== 'uncategorized' && (
                                    <span 
                                        className="delete-folder-button" 
                                        onClick={(e) => { 
                                            e.stopPropagation(); // Prevents accordion from toggling
                                            handleDeleteFolder(folderId, folder.name);
                                        }}
                                        title="Delete Folder"
                                    >
                                        &times;
                                    </span>
                                )}
                            </button>

                            {/* Nested Article List (toggles open/close) */}
                            <ul className={`article-list nested ${isOpen ? 'open' : ''}`}>
                                {folder.articles.map(article => (
                                    <li key={article._id} className="article-list-item">
                                        <NavLink to={`/articles/${article._id}`} className="article-title-link">
                                            {article.title}
                                        </NavLink>
                                        {/* Article Actions: Delete and Move */}
                                        <div className="article-actions">
                                            {/* Delete Article Button */}
                                            <button 
                                                className="action-button delete-button" 
                                                onClick={() => handleDeleteArticle(article._id, article.title)}
                                                title="Delete Article"
                                            >
                                                &#x2715; {/* Unicode 'X' mark */}
                                            </button>

                                            {/* Move Article Dropdown */}
                                            <select 
                                                className="action-button move-select" 
                                                onChange={(e) => handleMoveArticle(article._id, e.target.value)}
                                                value={article.folder ? article.folder._id : 'uncategorized'} // Set current folder as selected
                                                title="Move to Folder"
                                            >
                                                {/* Render options for all folders */}
                                                {allFoldersIncludingUncategorized.map(f => (
                                                    <option key={f._id} value={f._id}>
                                                        Move to {f.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
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
