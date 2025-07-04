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
                    
                    (articleData.highlights || []).forEach(h => {
                        const escaped = h.text?.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regex = new RegExp(escaped, 'gi');
                        doc.body.innerHTML = doc.body.innerHTML.replace(regex, match => `<mark class="highlight">${match}</mark>`);
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

            if (selectedText && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (contentRef.current && contentRef.current.contains(range.commonAncestorContainer)) {
                    const rect = range.getBoundingClientRect();
                    // Positioning the popup more centrally above the selection
                    setPopup({ 
                        visible: true, 
                        x: rect.left + window.scrollX + (rect.width / 2), // Center horizontally
                        y: rect.top + window.scrollY - 50, // Move further up 
                        text: selectedText 
                    });
                }
            }
        };

        const handleClickOutside = (event) => {
            if (popup.visible && !event.target.closest('.highlight-popup')) {
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
        const newHighlight = { text: popup.text };
        setPopup({ visible: false, x: 0, y: 0, text: '' });

        try {
            const res = await axios.post(`${BASE_URL}/articles/${id}/highlights`, newHighlight);
            setArticle(res.data);
            alert("Highlight saved!"); // Added alert for highlight saved
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

    if (error) return <h2 style={{color: 'red'}}>{error}</h2>;
    if (!article) return <h2>Loading article...</h2>;

    const allFoldersIncludingUncategorized = [
        { _id: 'uncategorized', name: 'Uncategorized' },
        ...folders.filter(f => f.name !== 'Uncategorized' && f._id !== 'uncategorized')
    ];

    return (
        <div className="article-viewer-container">
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
                            // Using transform to truly center the popup based on its own width/height
                            transform: 'translateX(-50%)' 
                        }}
                        onClick={saveHighlight}
                        title="Save Highlight"
                    >
                        {/* Replaced text with SVG icon and optionally a label */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="highlight-icon">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span className="highlight-label">Save</span> {/* Optional label */}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ArticleViewer;
