import './ArticleViewer.css';
import React, { useState, useEffect, useRef } from 'react';

const ArticleViewer = ({ articleContent, articleId }) => {
    const [highlights, setHighlights] = useState([]);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: "" });
    const popupRef = useRef(null);

    useEffect(() => {
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    const handleClickOutside = (event) => {
        if (popupRef.current && !popupRef.current.contains(event.target)) {
            setPopup({ visible: false, x: 0, y: 0, text: "" });
        }
    };

    const handleMouseUp = () => {
        setTimeout(() => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            if (!selectedText) return;

            console.log("📋 Text Selected:", selectedText);

            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            setPopup({
                visible: true,
                x: rect.left + window.scrollX,
                y: rect.top + window.scrollY - 40,
                text: selectedText
            });
        }, 100);
    };

    const saveHighlight = () => {
        const note = prompt("Add a note for this highlight:");
        const newHighlight = {
            text: popup.text,
            note: note || "",
            articleId: articleId,
            timestamp: Date.now()
        };

        setHighlights([...highlights, newHighlight]);

        // Apply highlight in the DOM
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const mark = document.createElement("mark");
            mark.className = "highlight";
            mark.textContent = popup.text;
            range.deleteContents();
            range.insertNode(mark);
        }

        console.log("✅ Highlight saved:", newHighlight);
        setPopup({ visible: false, x: 0, y: 0, text: "" });
    };

    return (
        <div>
            <div
                className="article-container"
                onMouseUp={handleMouseUp}
                dangerouslySetInnerHTML={{ __html: articleContent }}
            />
            
            {popup.visible && (
                <div
                    ref={popupRef}
                    className="highlight-popup"
                    style={{ top: popup.y, left: popup.x, position: "absolute" }}
                >
                    <button onClick={saveHighlight}>Save Highlight</button>
                </div>
            )}
        </div>
    );
};

export default ArticleViewer;