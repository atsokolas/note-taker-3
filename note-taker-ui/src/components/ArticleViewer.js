import React, { useState } from "react";

const ArticleViewer = ({ articleContent, articleId }) => {
    const [highlights, setHighlights] = useState([]);

    const handleMouseUp = () => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText) {
            const range = selection.getRangeAt(0);
            const highlightSpan = document.createElement("mark");
            highlightSpan.className = "highlight";
            range.surroundContents(highlightSpan);

            const newHighlight = {
                text: selectedText,
                articleId: articleId,
                timestamp: Date.now()
            };

            setHighlights([...highlights, newHighlight]);
        }
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