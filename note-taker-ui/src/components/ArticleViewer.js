/* global Mark */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { BASE_URL } from '../apiConfig';


const ArticleViewer = ({ onArticleChange }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(null);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
    const contentRef = useRef(null);
    const popupRef = useRef(null);
    const [folders, setFolders] = useState([]);
    
    const [editingHighlightId, setEditingHighlightId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editTags, setEditTags] = useState('');

    const [newHighlightNote, setNewHighlightNote] = useState('');
    const [newHighlightTags, setNewHighlightTags] = useState('');

    const fetchFolders = useCallback(async () => {
        try {
            const response = await axios.get(`${BASE_URL}/folders`, { withCredentials: true });
            const allFolders = [{ _id: 'uncategorized', name: 'Uncategorized' }, ...response.data];
            setFolders(allFolders);
        } catch (err) {
            console.error("Error fetching folders for move dropdown:", err);
        }
    }, []);

    // --- FIX 1: This logic is now split into two effects to safely load and highlight content ---
    // This effect now ONLY fetches the raw article data.
    useEffect(() => {
        if (id) {
            setArticle(null);
            setError(null);
            fetchFolders();

            const fetchArticle = async () => {
                try {
                    const res = await axios.get(`${BASE_URL}/articles/${id}`, { withCredentials: true });
                    setArticle(res.data);
                } catch (err) {
                    console.error("Error fetching article:", err);
                    setError("Could not load the selected article.");
                }
            };
            fetchArticle();
        }
    }, [id, fetchFolders]);

    // This new effect applies highlights using Mark.js AFTER the article has rendered.
    useEffect(() => {
        if (article && contentRef.current && typeof Mark !== 'undefined') {
            const instance = new Mark(contentRef.current);
            instance.unmark({
                done: () => {
                    (article.highlights || []).forEach(h => {
                        if (h.text) {
                            instance.mark(h.text, {
                                element: 'mark',
                                className: 'highlight',
                                attributes: { 'data-highlight-id': `highlight-${h._id}` }
                            });
                        }
                    });
                }
            });
        }
    }, [article]);
    // --- END FIX 1 ---

    // Your original useEffect for handling mouse events
    useEffect(() => {
        console.log("[DEBUG - AV EFFECT] Highlight listener useEffect started.");

        const handleMouseUp = (event) => {
            console.log("[DEBUG - AV] MouseUp detected inside handler.");
            if (!contentRef.current || !contentRef.current.contains(event.target) || event.target.closest('.highlight-popup-web-app-container')) {
                console.log("[DEBUG - AV] MouseUp not on valid content area or inside popup, ignoring.");
                return;
            }
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();
            console.log("[DEBUG - AV] Selected Text (inside handler):", `"${selectedText}"`, "Length:", selectedText.length);
            const isSelectionValid = selectedText && selectedText.length > 0 && selection.rangeCount > 0;
            if (isSelectionValid) {
                if (!popup.visible) {
                    console.log("[DEBUG - AV] All conditions met for highlight popup, SHOWING.");
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    setPopup({ visible: true, x: rect.left + window.scrollX + (rect.width / 2), y: rect.top + window.scrollY - 50, text: selectedText });
                    setNewHighlightNote('');
                    setNewHighlightTags('');
                } else {
                    console.log("[DEBUG - AV] Popup already visible (re-selection).");
                    setPopup(prevPopup => ({ ...prevPopup, text: selectedText })); 
                }
            } else {
                if (popup.visible) {
                    console.log("[DEBUG - AV] Conditions NOT met for highlight popup, HIDING.");
                    setPopup({ visible: false, x: 0, y: 0, text: '' });
                } else {
                    console.log("[DEBUG - AV] Popup already hidden, no action needed.");
                }
            }
        };

        const handleClickToDismiss = (event) => {
            console.log("[DEBUG - AV] Click detected for dismissal.");
            const clickIsOutsidePopup = popupRef.current && !popupRef.current.contains(event.target);
            const clickIsOnContent = contentRef.current && contentRef.current.contains(event.target);
            const selection = window.getSelection();
            const hasActiveSelection = selection && selection.toString().trim().length > 0;
            if (popup.visible && clickIsOutsidePopup) {
                if (clickIsOnContent && hasActiveSelection) {
                    console.log("[DEBUG - AV] Click inside content with active selection, not dismissing.");
                    return;
                }
                console.log("[DEBUG - AV] Dismissing popup.");
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            } else if (!popup.visible) {
                 console.log("[DEBUG - AV] Popup is not visible, click dismissal ignored.");
            }
        };
        
        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("click", handleClickToDismiss);
        
        return () => {
            console.log("[DEBUG - AV EFFECT] Cleanup: Removing event listeners.");
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("click", handleClickToDismiss);
        };
    }, [popup.visible, contentRef, popupRef, setPopup, setNewHighlightNote, setNewHighlightTags]);

    // --- FIX 2: Added { withCredentials: true } to all your original handler functions ---
    const saveHighlight = async () => {
        const newHighlight = { 
            text: popup.text,
            note: newHighlightNote, 
            tags: newHighlightTags.split(',').map(tag => tag.trim()).filter(t => t) 
        }; 
        setPopup({ visible: false, x: 0, y: 0, text: '' });
        try {
            const res = await axios.post(`${BASE_URL}/articles/${id}/highlights`, newHighlight, { withCredentials: true });
            setArticle(res.data);
            alert("Highlight saved!");
        } catch (err) {
            console.error("Failed to save highlight:", err);
            alert("Error: Could not save highlight.");
        }
    };
    const handleDeleteArticle = async () => {
        if (!article || !window.confirm(`Are you sure you want to delete "${article.title}"?`)) return;
        try {
            await axios.delete(`${BASE_URL}/articles/${article._id}`, { withCredentials: true });
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
            const response = await axios.patch(`${BASE_URL}/articles/${article._id}/move`, { folderId: newFolderId }, { withCredentials: true });
            setArticle(response.data);
            alert("Article moved successfully!");
            onArticleChange();
        } catch (err) {
            console.error("Error moving article:", err);
            alert("Failed to move article.");
        }
    };
    const updateHighlightOnBackend = async (highlightId, updatedNote, updatedTags) => {
        const response = await axios.patch(`${BASE_URL}/articles/${id}/highlights/${highlightId}`, {
            note: updatedNote,
            tags: updatedTags.split(',').map(tag => tag.trim()).filter(t => t)
        }, { withCredentials: true });
        return response.data;
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
        }
    };
    const deleteHighlight = async (highlightId) => {
        if (!window.confirm("Are you sure you want to delete this highlight?")) return;
        try {
            const response = await axios.delete(`${BASE_URL}/articles/${id}/highlights/${highlightId}`, { withCredentials: true });
            setArticle(response.data); 
            alert("Highlight deleted successfully!");
            onArticleChange();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to delete highlight.");
        }
    };
    // --- END FIX 2 ---

    // Your original functions, unchanged
    const scrollToHighlight = (highlightId) => {
        const targetElement = document.querySelector(`mark[data-highlight-id="${highlightId}"]`);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                    <button className="management-button delete-button" onClick={handleDeleteArticle}>Delete Article</button>
                    <select 
                        className="management-button move-select" 
                        onChange={handleMoveArticle}
                        value={article.folder ? article.folder._id : 'uncategorized'}
                    >
                        {allFoldersIncludingUncategorized.map(f => (
                            <option key={f._id} value={f._id}>{f.name}</option>
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
                        <div ref={popupRef} className="highlight-popup-web-app-container" style={{ top: popup.y, left: popup.x, position: 'absolute', transform: 'translateX(-50%)' }}>
                            <textarea className="highlight-input highlight-note-input" placeholder="Add a note (optional)" value={newHighlightNote} onChange={(e) => setNewHighlightNote(e.target.value)}></textarea>
                            <input type="text" className="highlight-input highlight-tags-input" placeholder="Tags (comma-separated, optional)" value={newHighlightTags} onChange={(e) => setNewHighlightTags(e.target.value)} />
                            <button className="highlight-popup-save-button" onClick={saveHighlight} title="Save Highlight">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="highlight-icon"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                                <span className="highlight-label">Save</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className="article-highlights-sidebar">
                <h2>Article Highlights</h2>
                {article.highlights && article.highlights.length > 0 ? (
                    <ul className="highlights-list">
                        {article.highlights.map(h => (
                            <li key={h._id} className={`sidebar-highlight-item ${editingHighlightId === h._id ? 'editing' : ''}`}>
                                {editingHighlightId === h._id ? (
                                    <>
                                        <textarea className="edit-highlight-note-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note" />
                                        <input type="text" className="edit-highlight-tags-input" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="Tags (comma-separated)" />
                                        <div className="edit-highlight-actions">
                                            <button className="edit-save-button" onClick={() => saveHighlightEdits(h._id)}>Save</button>
                                            <button className="edit-cancel-button" onClick={cancelEditHighlight}>Cancel</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="sidebar-highlight-text" onClick={() => scrollToHighlight(`highlight-${h._id}`)}>{h.text}</p>
                                        {h.note && <p className="sidebar-highlight-note">Note: {h.note}</p>}
                                        {h.tags && h.tags.length > 0 && (<div className="sidebar-highlight-tags">{h.tags.map(tag => (<span key={tag} className="highlight-tag">{tag}</span>))}</div>)}
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
