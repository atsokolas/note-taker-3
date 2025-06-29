import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const ArticleViewer = () => {
    const { id } = useParams();
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(null);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
    const contentRef = useRef(null); // Ref for the content div

    // Fetch article data when the ID in the URL changes
    useEffect(() => {
        if (id) {
            setArticle(null); // Clear previous article to show loading state
            setError(null);
            const fetchArticle = async () => {
                try {
                    const res = await axios.get(`https://note-taker-3-unrg.onrender.com/articles/${id}`);
                    const articleData = res.data;

                    // Fix relative image paths before setting content
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(articleData.content, 'text/html');
                    const articleOrigin = new URL(articleData.url).origin;
                    doc.querySelectorAll('img').forEach(img => {
                        const src = img.getAttribute('src');
                        if (src && src.startsWith('/')) {
                            img.src = `${articleOrigin}${src}`;
                        }
                    });
                    
                    // Re-apply existing highlights
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

    // Handle text selection for creating new highlights
    useEffect(() => {
        const handleMouseUp = () => {
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();

            if (selectedText && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                // Ensure the selection is within our article content
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
        setPopup({ visible: false, x: 0, y: 0, text: '' }); // Hide popup immediately

        try {
            const res = await axios.post(`https://note-taker-3-unrg.onrender.com/articles/${id}/highlights`, newHighlight);
            setArticle(res.data); // Refresh article with the new highlight included
        } catch (err) {
            console.error("Failed to save highlight:", err);
            alert("Error: Could not save highlight.");
        }
    };

    if (error) return <h2 style={{color: 'red'}}>{error}</h2>;
    if (!article) return <h2>Loading article...</h2>;

    return (
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
    );
};

export default ArticleViewer;

