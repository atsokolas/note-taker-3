// note-taker-ui/src/components/ArticleViewer.js - UPDATED FOR HIGHLIGHTS SIDEBAR

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const ArticleViewer = ({ onArticleChange }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(null);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
    const contentRef = useRef(null);
    const [folders, setFolders] = useState([]);

    const fetchFolders = async () => {
        try {
            const response = await axios.get(`${BASE_URL}/folders`);
            const allFolders = [{ _id: 'uncategorized', name: 'Uncategorized' }, ...response.data];
            setFolders(allFolders);
        } catch (err) {
            console.error("Error fetching folders for move dropdown:", err);
        }
    };

    useEffect(() => {
        if (id) {
            setArticle(null);
            setError(null);
            fetchFolders();

            const fetchArticle = async () => {
                try {
                    // Make sure the backend GET /articles/:id route populates highlights
                    // (We updated server.js to return highlights with /get-articles,
                    // but /articles/:id needs to ensure it returns the full highlights array too,
                    // which it should if it's just doing Article.findById(id).populate('folder') )
                    const res = await axios.get(`${BASE_URL}/articles/${id}`);
                    const articleData = res.data;

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(articleData.content, 'text/html');
                    const articleOrigin = new URL(articleData.url).origin;
                    doc.querySelectorAll('img').forEach(img => {
                        const src = img.getAttribute('src');
                        if (src && src.startsWith('/')) {
                            img.src = `${articleOrigin}${src}`;
                        }
                    });
                    
                    // Apply highlights visually
                    (articleData.highlights || []).forEach(h => {
                        // Create a unique ID for each highlight for the scroll-to-highlight feature
                        const highlightId = `highlight-${h._id}`; 
                        const escaped = h.text?.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regex = new RegExp(`(?<!<mark[^>]*>)${escaped}(?!<\\/mark>)`, 'gi'); // Avoid re-highlighting already marked text
                        
                        // Use a replace function to add the highlight class and the unique ID
                        doc.body.innerHTML = doc.body.innerHTML.replace(regex, match => {
                            // Only wrap if it's not already wrapped. Simple check.
                            if (match.includes('<mark class="highlight"')) {
                                return match;
                            }
                            return `<mark class="highlight" data-highlight-id="${highlightId}">${match}</mark>`;
                        });
                    });

                    setArticle({ ...articleData, content: doc.body.innerHTML });

                } catch (err) {
                    console.error("Error fetching article:", err);
                    setError("Could not load the selected article.");
                }
            };
            fetchArticle();
        }
    }, [id]);

    useEffect(() => {
        const handleMouseUp = () => {
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();

            // Only show popup if selection is within the content area and not empty
            if (selectedText && selection.rangeCount > 0 && contentRef.current && contentRef.current.contains(selection.getRangeAt(0).commonAncestorContainer)) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setPopup({ 
                    visible: true, 
                    x: rect.left + window.scrollX + (rect.width / 2), 
                    y: rect.top + window.scrollY - 50, 
                    text: selectedText 
                });
            } else {
                // If no selection or selection outside content, hide popup
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };

        const handleClickOutside = (event) => {
            // Hide if clicked outside popup, and not on a highlight itself (to keep popup on text selection)
            if (popup.visible && !event.target.closest('.highlight-popup') && !event.target.closest('mark.highlight')) {
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };

        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [popup.visible]);

    const saveHighlight = async () => {
        const newHighlight = { text: popup.text }; // For now, only text is collected here
        setPopup({ visible: false, x: 0, y: 0, text: '' });

        try {
            // This endpoint now expects note and tags from the extension content script
            // For ArticleViewer, it only collects text. If you want to add note/tags here,
            // you'd need UI for it. For now, it will save highlight with empty note/tags.
            const res = await axios.post(`${BASE_URL}/articles/${id}/highlights`, newHighlight);
            setArticle(res.data); // Update article state to include the new highlight
            alert("Highlight saved!");
        } catch (err) {
            console.error("Failed to save highlight:", err);
            alert("Error: Could not save highlight.");
        }
    };

    const handleDeleteArticle = async () => {
        if (!article || !window.confirm(`Are you sure you want to delete "${article.title}"?`)) {
            return;
        }
        try {
            await axios.delete(`${BASE_URL}/articles/${article._id}`);
            alert(`Article "${article.title}" deleted successfully!`);
            onArticleChange();
            navigate('/');
        } catch (err) {
            console.error("Error deleting article:", err);
            alert("Failed to delete article.");
        }
    };

    const handleMoveArticle = async (e) => {
        const newFolderId = e.target.value;
        if (!article || !newFolderId) return;

        try {
            const response = await axios.patch(`${BASE_URL}/articles/${article._id}/move`, { folderId: newFolderId });
            setArticle(response.data);
            alert("Article moved successfully!");
            onArticleChange();
        } catch (err) {
            console.error("Error moving article:", err);
            if (err.response && err.response.data && err.response.data.error) {
                alert(`Error moving article: ${err.response.data.error}`);
            } else {
                alert("Failed to move article.");
            }
        }
    };

    // --- NEW: Function to scroll to a highlight ---
    const scrollToHighlight = (highlightId) => {
        const targetElement = document.querySelector(`mark[data-highlight-id="${highlightId}"]`);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Optional: Briefly highlight the element visually after scrolling
            targetElement.style.transition = 'background-color 0.3s ease-in-out';
            targetElement.style.backgroundColor = 'var(--primary-color-light, rgba(0, 122, 255, 0.3))'; // A subtle blue flash
            setTimeout(() => {
                targetElement.style.backgroundColor = ''; // Revert after a short delay
            }, 1000);
        }
    };


    if (error) return <h2 style={{color: 'red'}}>{error}</h2>;
    if (!article) return <h2>Loading article...</h2>;

    const allFoldersIncludingUncategorized = [
        { _id: 'uncategorized', name: 'Uncategorized' },
        ...folders.filter(f => f.name !== 'Uncategorized' && f._id !== 'uncategorized')
    ];

    return (
        <div className="article-viewer-page"> {/* New container for viewer + highlights sidebar */}
            <div className="article-viewer-main"> {/* Existing content goes here */}
                <div className="article-management-bar">
                    <button 
                        className="management-button delete-button" 
                        onClick={handleDeleteArticle}
                        title="Delete Article"
                    >
                        Delete Article
                    </button>
                    <select 
                        className="management-button move-select" 
                        onChange={handleMoveArticle}
                        value={article.folder ? article.folder._id : 'uncategorized'}
                        title="Move to Folder"
                    >
                        {allFoldersIncludingUncategorized.map(f => (
                            <option key={f._id} value={f._id}>
                                Move to {f.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="article-content">
                    <h1>{article.title}</h1>
                    <div
                        ref={contentRef}
                        className="content-body"
                        dangerouslySetInnerHTML={{ __html: article.content }}
                    />
                    {popup.visible && (
                        <button
                            className="highlight-popup"
                            style={{ 
                                top: popup.y, 
                                left: popup.x, 
                                position: 'absolute', 
                                transform: 'translateX(-50%)' 
                            }}
                            onClick={saveHighlight}
                            title="Save Highlight"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="highlight-icon">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span className="highlight-label">Save</span>
                        </button>
                    )}
                </div>
            </div>

            {/* NEW: Highlights Sidebar */}
            <div className="article-highlights-sidebar">
                <h2>Article Highlights</h2>
                {article.highlights && article.highlights.length > 0 ? (
                    <ul className="highlights-list">
                        {article.highlights.map(h => (
                            <li key={h._id} className="sidebar-highlight-item">
                                <p className="sidebar-highlight-text" onClick={() => scrollToHighlight(`highlight-${h._id}`)}>
                                    {h.text}
                                </p>
                                {h.note && <p className="sidebar-highlight-note">Note: {h.note}</p>}
                                {h.tags && h.tags.length > 0 && (
                                    <div className="sidebar-highlight-tags">
                                        {h.tags.map(tag => (
                                            <span key={tag} className="highlight-tag">{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="no-highlights-message">No highlights for this article yet.</p>
                )}
            </div>
        </div>
    );
};

export default ArticleViewer;
