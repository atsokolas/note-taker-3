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

document.addEventListener("mouseup", async () => {
    console.log("🖱 Mouseup triggered");

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    console.log("🔍 Selected text:", selectedText);

    if (!selectedText || selectedText.length < 2) return;

    // Remove any existing tooltip
    const existingHost = document.getElementById("note-taker-shadow-host");
    if (existingHost) existingHost.remove();

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    console.log("📐 Highlight rect:", rect);

    // Create the tooltip
    const tooltip = document.createElement("div");
    tooltip.id = "note-taker-tooltip";
    tooltip.innerText = "💾 Save Highlight";

    Object.assign(tooltip.style, {
        position: "absolute",
        top: "0", // We'll position the host, not the tooltip itself
        left: "0",
        background: "#000",
        color: "#fff",
        padding: "6px 10px",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: "bold",
        cursor: "pointer",
        zIndex: "2147483647",
        boxShadow: "0 0 6px rgba(0,0,0,0.25)",
        border: "2px solid red"
    });

    // Create the shadow host and attach shadow DOM
    const host = document.createElement("div");
    host.id = "note-taker-shadow-host";
    host.style.position = "absolute";
    host.style.top = `${window.scrollY + rect.top - 40}px`;
    host.style.left = `${window.scrollX + rect.left}px`;
    host.style.zIndex = "2147483647";

    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    shadow.appendChild(tooltip);

    console.log("🚨 Tooltip appended:", tooltip);

    // Add click handler inside the tooltip
    tooltip.addEventListener("click", async () => {
        tooltip.innerText = "💾 Saving...";
        try {
            const res = await fetch("https://note-taker-3-unrg.onrender.com/save-highlight", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    highlight: selectedText,
                    url: window.location.href,
                    title: document.title,
                    timestamp: new Date().toISOString(),
                    userId: "exampleUserId"
                })
            });

            const result = await res.json();
            if (res.ok) {
                tooltip.innerText = "✅ Saved!";
                console.log("✅ Highlight saved:", result);
                setTimeout(() => {
                    host.remove(); // 🧹 Clean up after save
                }, 1200);
            } else {
                tooltip.innerText = "❌ Error";
                console.error("❌ Save failed:", result.error);
            }
        } catch (err) {
            tooltip.innerText = "❌ Network Error";
            console.error("❌ Error saving:", err.message);
        }

        selection.removeAllRanges();
    });

    // Check immediately if tooltip exists
    const tip = host.shadowRoot?.querySelector("#note-taker-tooltip");
    if (tip) {
        console.log("✅ Tooltip exists inside shadow DOM and is visible:", tip);
    } else {
        console.error("❌ Tooltip vanished or was never added (shadow DOM check).");
    }

    // 🧹 Dismiss tooltip if clicking outside
    document.addEventListener("click", function dismissTooltip(e) {
        if (!tooltip.contains(e.target)) {
            host.remove();
            document.removeEventListener("click", dismissTooltip);
        }
    }, { once: true });

    console.log("📌 Tooltip fully set up");
});