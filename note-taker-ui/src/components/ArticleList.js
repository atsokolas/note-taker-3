import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com"; // Define BASE_URL here

// A new, reusable component for the expand/collapse icon
const AccordionIcon = ({ isOpen }) => (
    <svg className={`accordion-icon ${isOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ArticleList = () => {
    const [groupedArticles, setGroupedArticles] = useState({});
    const [folders, setFolders] = useState([]); // State to hold all available folders
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // NEW: State to track which folder is currently open
    const [openFolder, setOpenFolder] = useState(null);
    const [newFolderName, setNewFolderName] = useState(''); // State for new folder input

    // Function to fetch articles and group them by folder
    const fetchAndGroupArticles = async () => {
        setLoading(true);
        setError(null);
        try {
            const articlesResponse = await axios.get(`${BASE_URL}/get-articles`);
            const foldersResponse = await axios.get(`${BASE_URL}/folders`); // Fetch folders as well

            const articlesData = articlesResponse.data;
            const foldersData = foldersResponse.data;

            // --- DEBUG LOGS ---
            console.log("[DEBUG] Raw articles fetched for grouping:", articlesData); 
            console.log("[DEBUG] Raw folders fetched for grouping:", foldersData); 
            // ------------------

            setFolders(foldersData); // Update folders state

            const articlesByFolder = articlesData.reduce((acc, article) => {
                const folderName = article.folder ? article.folder.name : 'Uncategorized';
                // Use a unique ID for the key; 'uncategorized' for articles without a folder
                const folderId = article.folder ? article.folder._id : 'uncategorized';
                
                if (!acc[folderId]) {
                    acc[folderId] = { id: folderId, name: folderName, articles: [] }; // Include id for consistency
                }
                
                acc[folderId].articles.push(article);
                return acc;
            }, {});

            // --- DEBUG LOG ---
            console.log("[DEBUG] Grouped articles after reduction:", articlesByFolder);
            // -----------------

            setGroupedArticles(articlesByFolder);
        } catch (err) {
            console.error("Failed to fetch articles or folders:", err);
            setError("Failed to load articles or folders.");
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch when component mounts
    useEffect(() => {
        fetchAndGroupArticles();
    }, []);

    // NEW: Function to handle clicking on a folder header
    const handleFolderClick = (folderId) => {
        // If the clicked folder is already open, close it by setting state to null.
        // Otherwise, open the clicked folder.
        setOpenFolder(openFolder === folderId ? null : folderId);
    };

    // --- NEW: Handle Create Folder ---
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) {
            alert("Please enter a folder name.");
            return;
        }
        try {
            const response = await axios.post(`${BASE_URL}/folders`, { name: newFolderName.trim() });
            alert(`Folder "${response.data.name}" created successfully!`);
            setNewFolderName(''); // Clear input
            await fetchAndGroupArticles(); // Refresh list to show new folder
        } catch (err) {
            console.error("Error creating folder:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error creating folder: ${err.response.data.error}`);
            } else {
                alert("Failed to create folder.");
            }
        }
    };

    // --- NEW: Handle Delete Folder ---
    const handleDeleteFolder = async (folderId, folderName) => {
        if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"? All articles in it must be moved first.`)) {
            return;
        }
        try {
            await axios.delete(`${BASE_URL}/folders/${folderId}`);
            alert(`Folder "${folderName}" deleted successfully!`);
            // Close the folder if it was open
            if (openFolder === folderId) {
                setOpenFolder(null);
            }
            await fetchAndGroupArticles(); // Refresh list
        } catch (err) {
            console.error("Error deleting folder:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error deleting folder: ${err.response.data.error}`);
            } else {
                alert("Failed to delete folder.");
            }
        }
    };

    // --- NEW: Handle Delete Article ---
    const handleDeleteArticle = async (articleId, articleTitle) => {
        if (!window.confirm(`Are you sure you want to delete "${articleTitle}"?`)) {
            return;
        }
        try {
            await axios.delete(`${BASE_URL}/articles/${articleId}`);
            alert(`Article "${articleTitle}" deleted successfully!`);
            await fetchAndGroupArticles(); // Refresh list
        } catch (err) {
            console.error("Error deleting article:", err);
            alert("Failed to delete article.");
        }
    };

    // --- NEW: Handle Move Article ---
    const handleMoveArticle = async (articleId, newFolderId) => {
        // --- DEBUG LOG ---
        console.log(`[DEBUG] Attempting to move article ${articleId} to folder ${newFolderId}`); 
        // -----------------
        try {
            const response = await axios.patch(`${BASE_URL}/articles/${articleId}/move`, { folderId: newFolderId });
            // --- DEBUG LOG ---
            console.log("[DEBUG] Backend response for move:", response.data); 
            // -----------------
            alert("Article moved successfully!");
            await fetchAndGroupArticles(); // Refresh list to show the article in its new folder
            // --- DEBUG LOG ---
            console.log("[DEBUG] fetchAndGroupArticles called after move.");
            // -----------------
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

    // Filter out 'Uncategorized' if it somehow exists as a real folder in 'folders' state
    const allFoldersIncludingUncategorized = [
        { _id: 'uncategorized', name: 'Uncategorized' },
        ...folders.filter(f => f.name !== 'Uncategorized') 
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
                                {/* Only show delete button for actual folders, not 'Uncategorized' */}
                                {folderId !== 'uncategorized' && (
                                    <span 
                                        className="delete-folder-button" 
                                        onClick={(e) => { 
                                            e.stopPropagation(); // Prevent folder from collapsing/expanding
                                            handleDeleteFolder(folderId, folder.name);
                                        }}
                                        title="Delete Folder"
                                    >
                                        &times;
                                    </span>
                                )}
                            </button>

                            {/* Conditionally apply the 'open' class to the article list for CSS animation */}
                            <ul className={`article-list nested ${isOpen ? 'open' : ''}`}>
                                {folder.articles.map(article => (
                                    <li key={article._id} className="article-list-item">
                                        <NavLink to={`/articles/${article._id}`} className="article-title-link">
                                            {article.title}
                                        </NavLink>
                                        {/* Removed article actions from here to ArticleViewer */}
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
