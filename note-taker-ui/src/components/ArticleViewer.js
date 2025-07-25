/* global Mark */
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
            setFolders(response.data);
        } catch (err) {
            console.error("Error fetching folders for move dropdown:", err);
        }
    }, []);

    // Effect 1: Fetches the raw article data
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

    // Effect 2: Applies highlights AFTER the article content has been rendered
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

    // Effect 3: Manages the highlight creation popup
    useEffect(() => {
        const handleMouseUp = (event) => {
            if (!contentRef.current || !contentRef.current.contains(event.target) || event.target.closest('.highlight-popup-web-app-container')) {
                return;
            }
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();
            if (selectedText && selectedText.length > 0 && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setPopup({
                    visible: true,
                    x: rect.left + window.scrollX + (rect.width / 2),
                    y: rect.top + window.scrollY - 10,
                    text: selectedText
                });
                setNewHighlightNote('');
                setNewHighlightTags('');
            }
        };

        const handleClickToDismiss = (event) => {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };

        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("mousedown", handleClickToDismiss);
        return () => {
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("mousedown", handleClickToDismiss);
        };
    }, []);

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
        if (!article || !window.confirm(`Are you sure you want to delete "${article.title}"?`)) {
            return;
        }
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
        if (!article) return;
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
    };

    const saveHighlightEdits = async (highlightId) => {
        try {
            const response = await axios.patch(`${BASE_URL}/articles/${id}/highlights/${highlightId}`, {
                note: editNote,
                tags: editTags.split(',').map(tag => tag.trim()).filter(t => t)
            }, { withCredentials: true });
            setArticle(response.data);
            cancelEditHighlight();
        } catch (err) {
            alert("Failed to update highlight.");
        }
    };

    const deleteHighlight = async (highlightId) => {
        if (!window.confirm("Are you sure you want to delete this highlight?")) {
            return;
        }
        try {
            const response = await axios.delete(`${BASE_URL}/articles/${id}/highlights/${highlightId}`, { withCredentials: true });
            setArticle(response.data);
        } catch (err) {
            alert("Failed to delete highlight.");
        }
    };

    if (error) return <h2 style={{color: 'red'}}>{error}</h2>;
    if (!article) return <h2>Loading article...</h2>;

    return (
        <div className="article-viewer-page">
            <div className="article-viewer-main">
                <div className="article-management-bar">
                    <button className="management-button delete-button" onClick={handleDeleteArticle}>
                        Delete Article
                    </button>
                    <select 
                        className="management-button move-select" 
                        onChange={handleMoveArticle}
                        value={article.folder ? article.folder._id : ''}
                    >
                        <option value="">Move to...</option>
                        {folders.map(f => (
                            <option key={f._id} value={f._id}>{f.name}</option>
                        ))}
                        <option value="">Uncategorized</option>
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
                        <div
                            ref={popupRef}
                            className="highlight-popup-web-app-container"
                            style={{ top: popup.y, left: popup.x, position: 'absolute', transform: 'translateX(-50%)' }}
                        >
                            <textarea 
                                className="highlight-input"
                                placeholder="Add a note..."
                                value={newHighlightNote}
                                onChange={(e) => setNewHighlightNote(e.target.value)}
                            />
                            <input 
                                type="text"
                                className="highlight-input"
                                placeholder="Tags (comma-separated)"
                                value={newHighlightTags}
                                onChange={(e) => setNewHighlightTags(e.target.value)}
                            />
                            <button className="highlight-popup-save-button" onClick={saveHighlight}>
                                Save Highlight
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
                                        <textarea className="edit-highlight-note-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                                        <input type="text" className="edit-highlight-tags-input" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                                        <div className="edit-highlight-actions">
                                            <button className="edit-save-button" onClick={() => saveHighlightEdits(h._id)}>Save</button>
                                            <button className="edit-cancel-button" onClick={cancelEditHighlight}>Cancel</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="sidebar-highlight-text" onClick={() => scrollToHighlight(`highlight-${h._id}`)}>
                                            {h.text}
                                        </p>
                                        {h.note && <p className="sidebar-highlight-note">Note: {h.note}</p>}
                                        {h.tags && h.tags.length > 0 && (
                                            <div className="sidebar-highlight-tags">
                                                {h.tags.map(tag => (<span key={tag} className="highlight-tag">{tag}</span>))}
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
