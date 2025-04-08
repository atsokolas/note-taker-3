console.log("✅ Content script initialized.");

// Extracts main article content from the page
function extractArticleContent() {
    try {
        const container = document.querySelector(
            "article, [class*='content'], [class*='main'], [id*='content'], [id*='main']"
        );

        if (!container) {
            throw new Error("Main article container not found.");
        }

        return {
            title: document.title || "Untitled Article",
            content: container.innerHTML,
            text: container.innerText,
        };
    } catch (err) {
        console.error("❌ Failed to extract article:", err.message);
        return {
            title: "",
            content: "",
            text: "",
            error: err.message,
        };
    }
}

// Respond to extraction request from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extractContent") {
        console.log("📩 Received extractContent request");
        const result = extractArticleContent();
        sendResponse(result);
    }

    return true;
});

// Tooltip for saving highlights
document.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const existingTooltip = document.getElementById("note-taker-tooltip");
    if (existingTooltip) existingTooltip.remove();

    const range = selection.getRangeAt(0);
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
        cursor: "pointer",
        zIndex: 99999,
        fontSize: "14px",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)"
    });

    document.body.appendChild(tooltip);

    tooltip.addEventListener("click", () => {
        chrome.runtime.sendMessage({
            action: "saveHighlight",
            text: selectedText,
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString(),
        }, (response) => {
            if (response?.success) {
                console.log("✅ Highlight saved.");
            } else {
                console.error("❌ Failed to save highlight:", response?.error);
            }
        });

        tooltip.remove();
    });

    document.addEventListener("click", function handleClickOutside(event) {
        if (!tooltip.contains(event.target)) {
            tooltip.remove();
            document.removeEventListener("click", handleClickOutside);
        }
    }, { once: true });
});