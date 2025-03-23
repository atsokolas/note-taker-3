import './ArticleViewer.css';
import React, { useState, useEffect, useRef } from 'react';

const ArticleViewer = ({ articleContent, articleId }) => {
    const [highlights, setHighlights] = useState([]);
    const contentRef = useRef(null);

    const handleMouseUp = () => {
        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                console.warn("❌ No text selected.");
                return;
            }

            const selectedText = selection.toString().trim();
            console.log("📋 MouseUp triggered!");
            console.log("Selected Text:", selectedText);

            if (selectedText) {
                // Ask user for notes and tags
                const note = prompt("Add a note for this highlight:");
                const tags = prompt("Add tags for this highlight (comma-separated):");

                // Save the highlight with note and tags
                const newHighlight = {
                    text: selectedText,
                    note: note || "",
                    tags: tags ? tags.split(",").map(tag => tag.trim()) : [],
                    articleId: articleId,
                    timestamp: Date.now()
                };

                setHighlights([...highlights, newHighlight]);
                console.log("✅ Highlight saved:", newHighlight);

                // Highlight in the DOM
                const range = selection.getRangeAt(0);
                if (range) {
                    const mark = document.createElement("mark");
                    mark.className = "highlight";
                    mark.title = `Note: ${note || "No note"}\nTags: ${newHighlight.tags.join(", ")}`;
                    mark.textContent = selectedText;

                    range.deleteContents();
                    range.insertNode(mark);
                    console.log("✅ Highlighted in DOM:", mark);
                } else {
                    console.warn("❌ No valid range detected for highlighting.");
                }

                // Clear selection to avoid confusion
                selection.removeAllRanges();
            }
        }, 100); // Small delay to improve text capture accuracy
    };

    return (
        <div ref={contentRef} style={{ padding: "20px", lineHeight: "1.6" }}>
            <div onMouseUp={handleMouseUp} dangerouslySetInnerHTML={{ __html: articleContent }} />
        </div>
    );
};

export default ArticleViewer;