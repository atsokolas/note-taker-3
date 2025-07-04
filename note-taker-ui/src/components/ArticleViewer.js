import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const ArticleViewer = ({ onArticleChange }) => { // Accept onArticleChange prop
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
                    setPopup({ visible: true, x: rect.left + window.scrollX, y: rect.top + window.scrollY - 45, text: selectedText });
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
            console.log("[DEBUG - ArticleViewer.js] Calling onArticleChange for delete."); // Add this
            onArticleChange(); // Notify App.js to refresh ArticleList
            navigate('/'); // Redirect to home page after deletion
        } catch (err) {
            console.error("Error deleting article:", err);
            alert("Failed to delete article.");
        }
    };

    const handleMoveArticle = async (e) => {
        const newFolderId = e.target.value;
        if (!article || !newFolderId) return;

        console.log(`[DEBUG - ArticleViewer.js] Attempting to move article ${article._id} to folder ${newFolderId}`); // Add this
        try {
            const response = await axios.patch(`${BASE_URL}/articles/${article._id}/move`, { folderId: newFolderId });
            setArticle(response.data); // Update article state with new folder info
            alert("Article moved successfully!");
            console.log("[DEBUG - ArticleViewer.js] Calling onArticleChange for move."); // Add this
            onArticleChange(); // Notify App.js to refresh ArticleList
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
            {/* New Management Bar */}
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
                        style={{ top: popup.y, left: popup.x, position: 'absolute' }}
                        onClick={saveHighlight}
                    >
                        Save Highlight
                    </button>
                )}
            </div>
        </div>
    );
};

export default ArticleViewer;
