console.log("✅ Content script loaded.");

// --- ARTICLE EXTRACTION ---
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

// --- RESPOND TO popup.js FOR FULL ARTICLE SAVE ---
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

// --- HIGHLIGHTING + SAVE TOOLTIP ---
console.log("📌 Adding mouseup listener");

// Create the tooltip element
function createTooltip(x, y) {
    const tooltip = document.createElement("div");
    tooltip.id = "note-taker-tooltip";
    tooltip.innerText = "💾 Save Highlight";

    Object.assign(tooltip.style, {
        position: "fixed",
        top: `${y + 10}px`,    // 10px below the end of selection
        left: `${x + 10}px`,   // 10px to the right of selection
        background: "red",
        color: "white",
        padding: "10px",
        fontSize: "20px",
        fontWeight: "bold",
        borderRadius: "8px",
        zIndex: "9999999",
        cursor: "pointer",
        userSelect: "none"
    });

    document.body.appendChild(tooltip);
    console.log("✅ Tooltip appended to body");

    return tooltip;
}

// Protect the tooltip from being removed
function protectTooltip(tooltip) {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === "childList") {
                const stillExists = document.body.contains(tooltip);
                if (!stillExists) {
                    console.warn("⚠️ Tooltip was removed, reinjecting...");
                    document.body.appendChild(tooltip);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log("🔒 Tooltip protected with MutationObserver");
}

// Main event: when the user finishes highlighting
document.addEventListener("mouseup", (event) => {
    console.log("🖱 Mouseup triggered");

    try {
        const selection = window.getSelection();
        if (!selection) {
            console.error("❌ No window.getSelection available");
            return;
        }
        const selectedText = selection.toString().trim();
        console.log("🔍 Selected text:", selectedText);

        if (!selectedText || selectedText.length < 2) {
            console.warn("⚠️ No valid text selected");
            return;
        }

        console.log("🛠 Preparing to create tooltip...");

        // Remove existing tooltip if it exists
        const existingTooltip = document.getElementById("note-taker-tooltip");
        if (existingTooltip) {
            console.warn("⚠️ Existing tooltip found, removing");
            existingTooltip.remove();
        }

        // Calculate tooltip position
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const x = rect.right + window.scrollX;
        const y = rect.bottom + window.scrollY;

        console.log(`📍 Tooltip position: x=${x}, y=${y}`);

        // Create and protect the tooltip
        const tooltip = createTooltip(x, y);
        protectTooltip(tooltip);

    } catch (err) {
        console.error("💥 Error during tooltip creation:", err);
    }
});