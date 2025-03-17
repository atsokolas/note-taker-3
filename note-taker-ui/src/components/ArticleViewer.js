import './ArticleViewer.css';
import React, { useState } from 'react';

const ArticleViewer = ({ articleContent, articleId }) => {
    const [highlights, setHighlights] = useState([]);

    const handleMouseUp = () => {
        setTimeout(() => {
            const selection = window.getSelection();
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
                    const highlightSpan = document.createElement("mark");
                    highlightSpan.className = "highlight";
                    highlightSpan.title = `Note: ${note || "No note"}\nTags: ${newHighlight.tags.join(", ")}`;
                    range.surroundContents(highlightSpan);
                    console.log("✅ Highlighted in DOM:", highlightSpan);
                } else {
                    console.warn("❌ No valid range detected for highlighting.");
                }

                // Clear selection to avoid confusion
                selection.removeAllRanges();
            } else {
                console.warn("❌ No text selected.");
            }
        }, 100); // Small delay to improve text capture accuracy
    };

    return (
        <div
            onMouseUp={handleMouseUp}
            dangerouslySetInnerHTML={{ __html: articleContent }}
            style={{ padding: "20px", lineHeight: "1.6" }}
        />
    );
};

export default ArticleViewer;