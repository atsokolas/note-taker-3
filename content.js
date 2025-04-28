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

// --- GLOBAL TOOLTIP MANAGEMENT ---
let currentTooltip = null;
let tooltipObserver = null;

// --- HIGHLIGHTING + SAVE TOOLTIP ---
console.log("📌 Adding mouseup listener");

document.addEventListener("mouseup", () => {
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

        // Remove existing tooltip and observer if any
        if (currentTooltip) {
            console.warn("⚠️ Existing tooltip found, removing");
            currentTooltip.remove();
            if (tooltipObserver) {
                tooltipObserver.disconnect();
                tooltipObserver = null;
            }
            currentTooltip = null;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        console.log(`📍 Tooltip position: left=${rect.left}, top=${rect.top}`);

        const tooltip = createTooltip(rect);
        protectTooltip(tooltip);
        currentTooltip = tooltip;

    } catch (err) {
        console.error("💥 Error during tooltip creation:", err);
    }
});

// Create tooltip button
function createTooltip(selectionRect) {
    const tooltip = document.createElement("div");
    tooltip.id = "note-taker-tooltip";
    tooltip.innerText = "💾 Save Highlight";

    const centerX = selectionRect.left + selectionRect.width / 2;

    Object.assign(tooltip.style, {
        position: "absolute",
        top: `${selectionRect.top - 40 + window.scrollY}px`, // Adjust for scroll
        left: `${centerX - 60 + window.scrollX}px`, // Adjust for scroll
        background: "#4F46E5",
        color: "white",
        padding: "8px 16px",
        fontSize: "16px",
        fontWeight: "600",
        borderRadius: "9999px",
        boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: "9999999",
        cursor: "pointer",
        userSelect: "none",
        opacity: "0",
        transform: "scale(0.95)",
        transition: "all 0.25s cubic-bezier(0.25, 1.5, 0.5, 1)",
    });

    document.body.appendChild(tooltip);

    requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
        tooltip.style.transform = "scale(1)";
    });

    tooltip.addEventListener("mouseenter", () => {
        tooltip.style.background = "#4338CA";
        tooltip.style.boxShadow = "0px 6px 16px rgba(0, 0, 0, 0.2)";
    });

    tooltip.addEventListener("mouseleave", () => {
        tooltip.style.background = "#4F46E5";
        tooltip.style.boxShadow = "0px 4px 12px rgba(0, 0, 0, 0.15)";
    });

    tooltip.addEventListener("click", () => {
        console.log("💾 Tooltip clicked, saving highlight...");
        tooltip.style.transform = "scale(1.1)";
        setTimeout(() => {
            saveHighlight();
            showSuccessToast(selectionRect.left + selectionRect.width / 2, selectionRect.top - 60);
            dismissTooltip(tooltip);
        }, 100);
    });

    return tooltip;
}

// Smoothly dismiss tooltip
function dismissTooltip(tooltip) {
    tooltip.style.transform = "translateY(-10px) scale(0.9)";
    tooltip.style.opacity = "0";
    setTimeout(() => {
        if (tooltip && tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
            console.log("🧹 Tooltip removed from DOM");
        }
    }, 300);
}

// Toast for "Saved!" success
function showSuccessToast(x, y) {
    const toast = document.createElement("div");
    toast.innerText = "✅ Saved!";
    Object.assign(toast.style, {
        position: "absolute",
        top: `${y + window.scrollY}px`,
        left: `${x - 30 + window.scrollX}px`,
        background: "#22C55E",
        color: "white",
        padding: "6px 12px",
        fontSize: "14px",
        fontWeight: "500",
        borderRadius: "8px",
        boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.1)",
        zIndex: "9999999",
        opacity: "0",
        transform: "translateY(0px)",
        transition: "all 0.4s ease-out"
    });

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(-10px)";
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-20px)";
        setTimeout(() => {
            if (toast && toast.parentNode) {
                toast.parentNode.removeChild(toast);
                console.log("🍞 Success toast removed from DOM");
            }
        }, 300);
    }, 1500);
}

async function saveHighlight() {
    const selection = window.getSelection();
    if (!selection) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const highlight = {
        text: selectedText,
        title: document.title || "Untitled",
        url: window.location.href,
        createdAt: new Date().toISOString()
    };

    try {
        const response = await fetch("https://note-taker-3-1.onrender.com/api/highlights", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(highlight)
        });

        if (!response.ok) throw new Error("Failed to save highlight.");

        console.log("✅ Highlight saved to server.");
        
        // Visually highlight the selection on the page
        visuallyHighlightSelection();
    } catch (error) {
        console.error("❌ Failed to save highlight:", error.message);
    }
}

// You also need this helper (put it nearby, right below saveHighlight maybe)
function visuallyHighlightSelection() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.style.backgroundColor = "#FFFF00"; // bright yellow
    span.style.borderRadius = "4px";
    span.style.padding = "2px 4px";
    span.dataset.highlight = "true"; // optional: mark it as "our" highlight

    range.surroundContents(span);
}

// Protect the tooltip from being removed
function protectTooltip(tooltip) {
    tooltipObserver = new MutationObserver((mutations) => {
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

    tooltipObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log("🔒 Tooltip protected with MutationObserver");
}