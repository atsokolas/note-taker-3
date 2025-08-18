// note-taker-ui/src/components/ArticleViewer.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const getAuthConfig = () => {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
    }
    return { headers: { Authorization: `Bearer ${token}` } };
};

const processArticleContent = (articleData) => {
    const { content, highlights, url } = articleData;
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const articleOrigin = new URL(url).origin;

    doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('/')) {
            img.src = `${articleOrigin}${src}`;
        }
    });
    
    (highlights || []).forEach(h => {
        const highlightId = `highlight-${h._id}`; 
        const escaped = h.text?.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(?<!<mark[^>]*>)${escaped}(?!<\\/mark>)`, 'gi'); 
        doc.body.innerHTML = doc.body.innerHTML.replace(regex, match => `<mark class="highlight" data-highlight-id="${highlightId}">${match}</mark>`);
    });

    return { ...articleData, content: doc.body.innerHTML };
};

const ArticleViewer = ({ onArticleChange }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(null);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
    const contentRef = useRef(null);
    const popupRef = useRef(null);
    // --- STEP 1: Create a ref to store the selection range ---
    const selectionRangeRef = useRef(null);
    // --------------------------------------------------------
    const [folders, setFolders] = useState([]);
    
    const [editingHighlightId, setEditingHighlightId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editTags, setEditTags] = useState('');

    const [newHighlightNote, setNewHighlightNote] = useState('');
    const [newHighlightTags, setNewHighlightTags] = useState('');

    const [isRecommendModalOpen, setIsRecommendModalOpen] = useState(false);
    const [selectedHighlights, setSelectedHighlights] = useState([]);

    const fetchFolders = useCallback(async () => {
        try {
            const response = await axios.get(`${BASE_URL}/folders`, getAuthConfig());
            const allFolders = [{ _id: 'uncategorized', name: 'Uncategorized' }, ...response.data];
            setFolders(allFolders);
        } catch (err) {
            console.error("Error fetching folders for move dropdown:", err);
        }
    }, []);

    useEffect(() => {
        if (id) {
            setArticle(null);
            setError(null);
            fetchFolders();

            const fetchArticle = async () => {
                try {
                    const res = await axios.get(`${BASE_URL}/articles/${id}`, getAuthConfig());
                    const processedArticle = processArticleContent(res.data);
                    setArticle(processedArticle);

                } catch (err) {
                    console.error("Error fetching article:", err);
                    setError("Could not load the selected article.");
                }
            };
            fetchArticle();
        }
    }, [id, fetchFolders]);

    useEffect(() => {
        const handleMouseUp = (event) => {
            if (!contentRef.current || !contentRef.current.contains(event.target) || event.target.closest('.highlight-popup-web-app-container')) {
                return;
            }

            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();

            if (selectedText && selectedText.length > 0 && selection.rangeCount > 0) {
                // --- STEP 2: Save the selection range before showing the popup ---
                selectionRangeRef.current = selection.getRangeAt(0);
                // ---------------------------------------------------------------
                
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setPopup({ visible: true, x: rect.left + window.scrollX + (rect.width / 2), y: rect.top + window.scrollY - 50, text: selectedText });
                setNewHighlightNote('');
                setNewHighlightTags('');

            } else {
                if (popup.visible) {
                    setPopup({ visible: false, x: 0, y: 0, text: '' });
                }
            }
        };

        const handleClickToDismiss = (event) => {
            const clickIsOutsidePopup = popupRef.current && !popupRef.current.contains(event.target);
            
            if (popup.visible && clickIsOutsidePopup) {
                // Prevent dismissing if the user is trying to adjust their selection
                const selection = window.getSelection();
                if (selection && selection.toString().trim().length > 0) {
                    return;
                }
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };
        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("mousedown", handleClickToDismiss);
        return () => {
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("mousedown", handleClickToDismiss);
        };
    }, [popup.visible]);

    // --- STEP 3: Add a new useEffect to restore the selection ---
    useEffect(() => {
        if (popup.visible && selectionRangeRef.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(selectionRangeRef.current);
        }
    }, [popup.visible]);
    // ----------------------------------------------------------

    const handleHighlightSelectionChange = (highlightId) => {
        setSelectedHighlights(prevSelected => {
            if (prevSelected.includes(highlightId)) {
                return prevSelected.filter(id => id !== highlightId);
            } else {
                if (prevSelected.length < 10) {
                    return [...prevSelected, highlightId];
                }
                return prevSelected;
            }
        });
    };

    const handleRecommendArticle = async () => {
        if (selectedHighlights.length === 0) {
            alert("Please select at least one highlight to recommend.");
            return;
        }
        try {
            const payload = { articleId: article._id, highlightIds: selectedHighlights };
            await axios.post(`${BASE_URL}/api/recommendations`, payload, getAuthConfig());
            alert("Article recommended successfully!");
            setIsRecommendModalOpen(false);
            setSelectedHighlights([]);
        } catch (err) {
            console.error("Error recommending article:", err);
            alert(err.response?.data?.error || "Failed to recommend article.");
        }
    };

    const saveHighlight = async () => {
        const newHighlight = { 
            text: popup.text,
            note: newHighlightNote, 
            tags: newHighlightTags.split(',').map(tag => tag.trim()).filter(t => t) 
        }; 
        setPopup({ visible: false, x: 0, y: 0, text: '' });
        try {
            const res = await axios.post(`${BASE_URL}/articles/${id}/highlights`, newHighlight, getAuthConfig());
            const processedArticle = processArticleContent(res.data);
            setArticle(processedArticle);
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
            await axios.delete(`${BASE_URL}/articles/${article._id}`, getAuthConfig());
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
            const response = await axios.patch(`${BASE_URL}/articles/${article._id}/move`, { folderId: newFolderId }, getAuthConfig());
            setArticle(response.data);
            alert("Article moved successfully!");
            onArticleChange();
        } catch (err) {
            console.error("Error moving article:", err);
            alert(err.response?.data?.error || "Failed to move article.");
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
            }, getAuthConfig());
            return response.data; 
        } catch (err) {
            console.error("Error updating highlight on backend:", err);
            throw new Error(err.response?.data?.error || "Failed to update highlight.");
        }
    };

    const saveHighlightEdits = async (highlightId) => {
        try {
            const updatedArticleData = await updateHighlightOnBackend(highlightId, editNote, editTags);
            const processedArticle = processArticleContent(updatedArticleData);
            setArticle(processedArticle); 
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
            const response = await axios.delete(`${BASE_URL}/articles/${id}/highlights/${highlightId}`, getAuthConfig());
            const processedArticle = processArticleContent(response.data);
            setArticle(processedArticle);
            alert("Highlight deleted successfully!");
            onArticleChange();
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
                        className="management-button" 
                        onClick={() => setIsRecommendModalOpen(true)}
                        title="Recommend Article"
                    >
                        Recommend
                    </button>
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
                        <div
                            ref={popupRef}
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
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="highlight-icon">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                </svg>
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

            {isRecommendModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Recommend Article</h2>
                        <p>Select up to 10 highlights to share with your recommendation.</p>
                        <p className="highlight-counter">{selectedHighlights.length} / 10 selected</p>
                        
                        <div className="highlight-selection-list">
                            {(article.highlights || []).map(h => (
                                <div key={h._id} className="highlight-selection-item">
                                    <input 
                                        type="checkbox"
                                        id={`cb-${h._id}`}
                                        checked={selectedHighlights.includes(h._id)}
                                        onChange={() => handleHighlightSelectionChange(h._id)}
                                        disabled={selectedHighlights.length >= 10 && !selectedHighlights.includes(h._id)}
                                    />
                                    <label htmlFor={`cb-${h._id}`}>{h.text}</label>
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions">
                            <button className="secondary-button" onClick={() => { setIsRecommendModalOpen(false); setSelectedHighlights([]); }}>Cancel</button>
                            <button className="primary-button" onClick={handleRecommendArticle}>Confirm Recommendation</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArticleViewer;
