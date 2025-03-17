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

                // Highlight in the DOM (Fallback version for robustness)
                const range = selection.getRangeAt(0);
                if (range) {
                    const span = document.createElement('span');
                    span.innerHTML = `<mark class="highlight" title="Note: ${note || 'No note'}\nTags: ${newHighlight.tags.join(", ")}">${selectedText}</mark>`;

                    range.deleteContents();
                    range.insertNode(span);
                    console.log("✅ Highlighted in DOM:", span);
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
