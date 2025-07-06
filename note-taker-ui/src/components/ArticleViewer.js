// note-taker-ui/src/components/ArticleViewer.js - FINAL & COMPLETE VERSION

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
    
    // State for highlight editing in the sidebar
    const [editingHighlightId, setEditingHighlightId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editTags, setEditTags] = useState('');

    // State for highlight CREATION POPUP on the web app
    const [newHighlightNote, setNewHighlightNote] = useState('');
    const [newHighlightTags, setNewHighlightTags] = useState('');

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
                        const highlightId = `highlight-${h._id}`; 
                        const escaped = h.text?.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regex = new RegExp(`(?<!<mark[^>]*>)${escaped}(?!<\\/mark>)`, 'gi'); 
                        
                        doc.body.innerHTML = doc.body.innerHTML.replace(regex, match => {
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

            if (selectedText && selection.rangeCount > 0 && contentRef.current && contentRef.current.contains(selection.getRangeAt(0).commonAncestorContainer)) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setPopup({ 
                    visible: true, 
                    x: rect.left + window.scrollX + (rect.width / 2), 
                    y: rect.top + window.scrollY - 50, 
                    text: selectedText 
                });
                // Reset new highlight inputs when popup appears
                setNewHighlightNote('');
                setNewHighlightTags('');
            } else {
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };

        const handleClickOutside = (event) => {
            if (popup.visible && !event.target.closest('.highlight-popup-web-app-container') && !event.target.closest('mark.highlight')) {
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

    // MODIFIED: saveHighlight function to use new state variables and send note/tags
    const saveHighlight = async () => {
        const newHighlight = { 
            text: popup.text,
            note: newHighlightNote, // Use state for note
            tags: newHighlightTags.split(',').map(tag => tag.trim()).filter(t => t) // Use state for tags
        }; 
        setPopup({ visible: false, x: 0, y: 0, text: '' }); // Hide popup immediately

        try {
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

    const scrollToHighlight = (highlightId) => {
        const targetElement = document.querySelector(`mark[data-highlight-id="${highlightId}"]`);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.style.transition = 'background-color 0.3s ease-in-out';
            targetElement.style.backgroundColor = 'var(--primary-color-light, rgba(0, 122, 255, 0.3))';
            setTimeout(() => {
                targetElement.style.backgroundColor = ''; 
            }, 1000);
        }
    };

    // Handle starting highlight edit mode (for sidebar highlights)
    const startEditHighlight = (highlight) => {
        setEditingHighlightId(highlight._id);
        setEditNote(highlight.note || '');
        setEditTags(highlight.tags ? highlight.tags.join(', ') : '');
    };

    // Handle canceling highlight edit mode (for sidebar highlights)
    const cancelEditHighlight = () => {
        setEditingHighlightId(null);
        setEditNote('');
        setEditTags('');
    };

    // Backend API call for updating a highlight (used by saveHighlightEdits)
    const updateHighlightOnBackend = async (highlightId, updatedNote, updatedTags) => {
        try {
            const response = await axios.patch(`${BASE_URL}/articles/${id}/highlights/${highlightId}`, {
                note: updatedNote,
                tags: updatedTags.split(',').map(tag => tag.trim()).filter(t => t)
            });
            return response.data; 
        } catch (err) {
            console.error("Error updating highlight on backend:", err);
            throw new Error(err.response?.data?.error || "Failed to update highlight.");
        }
    };

    // Handle saving highlight edits (for sidebar highlights)
    const saveHighlightEdits = async (highlightId) => {
        try {
            const updatedArticleData = await updateHighlightOnBackend(highlightId, editNote, editTags);
            setArticle(updatedArticleData); 
            alert("Highlight updated successfully!");
            cancelEditHighlight(); 
            onArticleChange(); // Notify parent (App.js) for global highlights view refresh
        } catch (err) {
            alert(err.message);
            console.error("Failed to save highlight edits:", err);
        }
    };

    // Handle deleting a specific highlight (from sidebar)
    const deleteHighlight = async (highlightId) => {
        if (!window.confirm("Are you sure you want to delete this highlight?")) {
            return;
        }
        try {
            const response = await axios.delete(`${BASE_URL}/articles/${id}/highlights/${highlightId}`);
            setArticle(response.data); 
            alert("Highlight deleted successfully!");
            onArticleChange(); // Notify parent (App.js) for global highlights view refresh
        } catch (err) {
            alert(err.response?.data?.error || "Failed to delete highlight.");
            console.error("Failed to delete highlight:", err);
        }
    };

    if (error) return <h2 style={{color: 'red'}}>{error}</h2>;
    if (!article) return <h2>Loading article...</h2>;

    const allFoldersIncludingUncategorized = [
        { _id: 'uncategorized', name: 'Uncategorized' },
        ...folders.filter(f => f.name !== 'Uncategorized' && f._id !== 'uncategorized')
    ];

    return (
        <div className="article-viewer-page">
            <div className="article-viewer-main">
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
                        // This is the highlight creation popup when text is selected on the web app
                        <div
                            className="highlight-popup-web-app-container"
                            style={{ 
                                top: popup.y, 
                                left: popup.x, 
                                position: 'absolute', 
                                transform: 'translateX(-50%)' 
                            }}
                        >
                            <textarea 
                                className="highlight-input highlight-note-input"
                                placeholder="Add a note (optional)"
                                value={newHighlightNote}
                                onChange={(e) => setNewHighlightNote(e.target.value)}
                            ></textarea>
                            <input 
                                type="text"
                                className="highlight-input highlight-tags-input"
                                placeholder="Tags (comma-separated, optional)"
                                value={newHighlightTags}
                                onChange={(e) => setNewHighlightTags(e.target.value)}
                            />
                            <button
                                className="highlight-popup-save-button"
                                onClick={saveHighlight}
                                title="Save Highlight"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="highlight-icon">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                </svg>
                                <span className="highlight-label">Save</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Highlights Sidebar */}
            <div className="article-highlights-sidebar">
                <h2>Article Highlights</h2>
                {article.highlights && article.highlights.length > 0 ? (
                    <ul className="highlights-list">
                        {article.highlights.map(h => (
                            <li key={h._id} className={`sidebar-highlight-item ${editingHighlightId === h._id ? 'editing' : ''}`}>
                                {editingHighlightId === h._id ? (
                                    // Edit Mode UI for sidebar highlights
                                    <>
                                        <textarea 
                                            className="edit-highlight-note-input"
                                            value={editNote}
                                            onChange={(e) => setEditNote(e.target.value)}
                                            placeholder="Note"
                                        />
                                        <input
                                            type="text"
                                            className="edit-highlight-tags-input"
                                            value={editTags}
                                            onChange={(e) => setEditTags(e.target.value)}
                                            placeholder="Tags (comma-separated)"
                                        />
                                        <div className="edit-highlight-actions">
                                            <button className="edit-save-button" onClick={() => saveHighlightEdits(h._id)}>Save</button>
                                            <button className="edit-cancel-button" onClick={cancelEditHighlight}>Cancel</button>
                                        </div>
                                    </>
                                ) : (
                                    // Display Mode UI for sidebar highlights
                                    <>
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
                                        <div className="highlight-item-actions">
                                            <button className="edit-button" onClick={() => startEditHighlight(h)}>Edit</button>
                                            <button className="delete-button" onClick={() => deleteHighlight(h._id)}>Delete</button>
                                        </div>
                                    </>
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
