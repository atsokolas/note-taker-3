// note-taker-ui/src/components/ArticleViewer.js - ABSOLUTE PATCH FOR MISSING INITIALIZATION AND DUPLICATES

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const ArticleViewer = ({ onArticleChange }) => {
    // --- START OF ALL HOOKS AND STATE VARIABLES DECLARED AT THE TOP OF THE COMPONENT ---
    const { id } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(null);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
    const contentRef = useRef(null); // Ref for the main article content div
    const popupRef = useRef(null);   // Ref for the highlight popup container
    const [folders, setFolders] = useState([]);
    
    // State for highlight editing in the sidebar
    const [editingHighlightId, setEditingHighlightId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editTags, setEditTags] = useState('');

    // State for highlight CREATION POPUP on the web app
    const [newHighlightNote, setNewHighlightNote] = useState('');
    const [newHighlightTags, setNewHighlightTags] = useState('');
    // --- END OF ALL HOOKS AND STATE VARIABLES ---

    // note-taker-ui/src/components/ArticleViewer.js

    const fetchFolders = async () => { /* ... */ };

    // useEffect for fetching article data (remains unchanged from last correct version)
    useEffect(() => {
        if (id) {
            setArticle(null);
            setError(null);
            fetchFolders();
            const fetchArticle = async () => { /* ... */ };
            fetchArticle();
        }
    }, [id]);

    // --- CRITICAL useEffect to debug now (mouse events for selection and popup dismissal) ---
    useEffect(() => {
        console.log("[DEBUG - AV EFFECT] Highlight listener useEffect started."); // NEW LOG HERE

        const handleMouseUp = () => {
            console.log("[DEBUG - AV] MouseUp detected inside handler."); // NEW LOG HERE
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();

            console.log("[DEBUG - AV] Selected Text (inside handler):", `"${selectedText}"`, "Length:", selectedText.length); // NEW LOG
            console.log("[DEBUG - AV] Selection Range Count (inside handler):", selection?.rangeCount); // NEW LOG

            // Only proceed if text is actually selected AND it's within the article content area
            if (selectedText && selectedText.length > 0 && selection.rangeCount > 0 && contentRef.current && contentRef.current.contains(selection.getRangeAt(0).commonAncestorContainer)) {
                console.log("[DEBUG - AV] All conditions met for highlight popup (inside handler)."); // NEW LOG
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setPopup({
                    visible: true,
                    x: rect.left + window.scrollX + (rect.width / 2),
                    y: rect.top + window.scrollY - 50,
                    text: selectedText
                });
                setNewHighlightNote('');
                setNewHighlightTags('');
            } else {
                console.log("[DEBUG - AV] Conditions NOT met for highlight popup, hiding (inside handler)."); // NEW LOG
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };

        const handleClickToDismiss = (event) => {
            console.log("[DEBUG - AV] Click detected for dismissal."); // NEW LOG
            if (popup.visible && popupRef.current && !popupRef.current.contains(event.target)) {
                const selection = window.getSelection();
                if (contentRef.current && contentRef.current.contains(event.target) && selection && selection.toString().trim().length > 0) {
                    console.log("[DEBUG - AV] Click inside content area with selection, not dismissing."); // NEW LOG
                    return;
                }
                console.log("[DEBUG - AV] Dismissing popup."); // NEW LOG
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };

        // Attach mouseup for showing popup
        document.addEventListener("mouseup", handleMouseUp);
        // Attach a global click listener for dismissing the popup.
        document.addEventListener("click", handleClickToDismiss);

        // Cleanup function for useEffect
        return () => {
            console.log("[DEBUG - AV EFFECT] Cleanup: Removing event listeners."); // NEW LOG HERE
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("click", handleClickToDismiss);
        };

    }, [popup.visible, contentRef, popupRef]); // Ensure popupRef is in dependencies

  
    // --- THIS IS THE SECOND useEffect (for fetching article data and applying visual highlights) ---
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
    }, [id]); // Dependency on 'id'


    // --- All other helper functions defined here (NOT inside useEffect) ---

    // MODIFIED: saveHighlight function to use new state variables and send note/tags
    const saveHighlight = async () => {
        const newHighlight = { 
            text: popup.text,
            note: newHighlightNote, 
            tags: newHighlightTags.split(',').map(tag => tag.trim()).filter(t => t) 
        }; 
        setPopup({ visible: false, x: 0, y: 0, text: '' });

        try {
            const res = await axios.post(`${BASE_URL}/articles/${id}/highlights`, newHighlight);
            setArticle(res.data);
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

    const startEditHighlight = (highlight) => {
        setEditingHighlightId(highlight._id);
        setEditNote(highlight.note || '');
        setEditTags(highlight.tags ? highlight.tags.join(', ') : '');
    };

    const cancelEditHighlight = () => {
        setEditingHighlightId(null);
        setEditNote('');
        setEditTags('');
    };

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

    const saveHighlightEdits = async (highlightId) => {
        try {
            const updatedArticleData = await updateHighlightOnBackend(highlightId, editNote, editTags);
            setArticle(updatedArticleData); 
            alert("Highlight updated successfully!");
            cancelEditHighlight(); 
            onArticleChange();
        } catch (err) {
            alert(err.message);
            console.error("Failed to save highlight edits:", err);
        }
    };

    const deleteHighlight = async (highlightId) => {
        if (!window.confirm("Are you sure you want to delete this highlight?")) {
            return;
        }
        try {
            const response = await axios.delete(`${BASE_URL}/articles/${id}/highlights/${highlightId}`);
            setArticle(response.data); 
            alert("Highlight deleted successfully!");
            onArticleChange();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to delete highlight.");
            console.error("Failed to delete highlight:", err);
        }
    };

    // --- START OF JSX RETURN STATEMENT ---
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
                            ref={popupRef} /* Attach popupRef here */
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
}; // <--- This closing brace was missing, leading to compilation issues.

export default ArticleViewer;
