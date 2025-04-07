import './ArticleViewer.css';
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const ArticleViewer = ({ articleContent, articleId }) => {
    const [highlights, setHighlights] = useState([]);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: "" });
    const popupRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        fetchHighlights();
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    const handleClickOutside = (event) => {
        if (popupRef.current && !popupRef.current.contains(event.target)) {
            setPopup({ visible: false, x: 0, y: 0, text: "" });
        }
    };

    const fetchHighlights = async () => {
        try {
            const res = await axios.get(`http://localhost:5500/articles/${articleId}`);
            const highlightsFromDB = res.data.highlights || [];
            setHighlights(highlightsFromDB);
            console.log("📥 Fetched highlights:", highlightsFromDB);
        } catch (err) {
            console.error("❌ Error fetching highlights:", err);
        }
    };

    const handleMouseUp = () => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (!selectedText) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setPopup({
            visible: true,
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY - 40,
            text: selectedText,
        });

        console.log("📌 Text selected:", selectedText);
    };

    const saveHighlight = async () => {
        const note = prompt("Add a note for this highlight:");

        const newHighlight = {
            text: popup.text,
            note: note || "",
            tags: [],
        };

        try {
            const res = await axios.post(`http://localhost:5500/articles/${articleId}/highlights`, newHighlight);
            const updatedArticle = res.data.article;
            setHighlights(updatedArticle.highlights);
            console.log("✅ Highlight saved to server:", newHighlight);
        } catch (err) {
            console.error("❌ Failed to save highlight:", err);
        }

        // Apply visual marking in DOM
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const mark = document.createElement("mark");
            mark.className = "highlight";
            mark.textContent = popup.text;
            range.deleteContents();
            range.insertNode(mark);
        }

        setPopup({ visible: false, x: 0, y: 0, text: "" });
    };

    const renderArticleWithHighlights = () => {
        let renderedContent = articleContent;
        highlights.forEach(h => {
            const escaped = h.text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(escaped, 'gi');
            renderedContent = renderedContent.replace(regex, match => `<mark class="highlight">${match}</mark>`);
        });
        return renderedContent;
    };

    return (
        <div>
            <div
                className="article-container"
                ref={containerRef}
                onMouseUp={handleMouseUp}
                dangerouslySetInnerHTML={{ __html: renderArticleWithHighlights() }}
            />

            {popup.visible && (
                <div
                    ref={popupRef}
                    className="highlight-popup"
                    style={{ top: popup.y, left: popup.x, position: "absolute", zIndex: 10 }}
                >
                    <button onClick={saveHighlight}>💾 Save Highlight</button>
                </div>
            )}
        </div>
    );
};

export default ArticleViewer;