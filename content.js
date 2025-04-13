console.log("✅ Content script loaded.");

// Extract the main article content
function extractArticleContent() {
    try {
        const container = document.querySelector("article, [class*='content'], [class*='main'], [id*='content'], [id*='main']");
        if (!container) throw new Error("Main content container not found.");

        return {
            title: document.title || "Untitled",
            content: container.innerHTML,
            text: container.innerText
        };
    } catch (error) {
        console.error("❌ Extraction failed:", error.message);
        return {
            title: "",
            content: "",
            text: "",
            error: error.message
        };
    }
}

// Respond to messages from popup.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "extractContent") {
        console.log("📥 Received extractContent request");

        try {
            const article = extractArticleContent();

            if (!article || !article.content) {
                console.warn("⚠️ No article content found.");
                sendResponse({ success: false, error: "No article content found" });
                return;
            }

            console.log("📰 Extracted article content:", {
                title: article.title,
                url: window.location.href,
                textLength: article.text.length
            });

            sendResponse({
                success: true,
                data: {
                    ...article,
                    url: window.location.href
                }
            });
        } catch (err) {
            console.error("❌ Error extracting article:", err.message);
            sendResponse({ success: false, error: err.message });
        }

        return true;
    }
});

// Highlight tooltip on text selection
document.addEventListener("mouseup", () => {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText) return;

    document.getElementById("note-taker-tooltip")?.remove();

    const range = window.getSelection().getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const tooltip = document.createElement("div");
    tooltip.id = "note-taker-tooltip";
    tooltip.innerText = "💾 Save Highlight";

    Object.assign(tooltip.style, {
        position: "absolute",
        top: `${window.scrollY + rect.top - 30}px`,
        left: `${window.scrollX + rect.left}px`,
        background: "#333",
        color: "#fff",
        padding: "5px 10px",
        borderRadius: "6px",
        fontSize: "14px",
        zIndex: 99999,
        cursor: "pointer",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)"
    });

    tooltip.addEventListener("click", () => {
        chrome.runtime.sendMessage({
            action: "saveHighlight",
            text: selectedText,
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString()
        }, (response) => {
            if (response?.success) {
                console.log("✅ Highlight saved.");
            } else {
                console.error("❌ Failed to save highlight:", response?.error);
            }
        });

        tooltip.remove();
    });

    document.body.appendChild(tooltip);

    document.addEventListener("click", function dismissTooltip(e) {
        if (!tooltip.contains(e.target)) {
            tooltip.remove();
            document.removeEventListener("click", dismissTooltip);
        }
    }, { once: true });
});