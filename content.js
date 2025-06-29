// content.js - FINAL VERSION WITH CORRECT HIGHLIGHT SAVING

(function () {
  if (window.hasRunNoteTakerScript) return;
  window.hasRunNoteTakerScript = true;

  const BASE_URL = "https://note-taker-3-unrg.onrender.com";
  const selfDomain = "note-taker-3-1.onrender.com";

  if (window.location.hostname.includes(selfDomain)) {
    return;
  }

  // --- 1. ADD A VARIABLE TO STORE THE ARTICLE ID ---
  let savedArticleId = null;
  
  let isHighlightingActive = false;
  let lastSelectionRange = null;
  // Note: We remove the old `savedHighlights` array as the server is now the source of truth.

  function loadAndRenderHighlights(articleUrl) {
    // This function logic remains correct.
    fetch(`${BASE_URL}/highlights?url=${encodeURIComponent(articleUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data.highlights)) {
          data.highlights.forEach((highlight) => {
            applyHighlightToText(highlight.text);
          });
        }
      })
      .catch((err) => {
        console.warn("Could not load previous highlights:", err.message);
      });
  }

  document.addEventListener("mouseup", () => {
    if (!isHighlightingActive) return;
    const selection = window.getSelection();
    const selected = selection.toString().trim();
    if (!selected || selected.length < 1 || selection.rangeCount === 0) return;
    lastSelectionRange = selection.getRangeAt(0).cloneRange();
    addTooltipToSelection(selected);
  });

  function addTooltipToSelection(textToSave) {
    // This function logic remains correct.
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const tooltip = document.createElement("div");
    tooltip.innerText = "💾 Save Highlight";
    tooltip.style.cssText = `
      position: absolute; background: #333; color: white; padding: 5px 10px;
      border-radius: 6px; font-size: 12px; cursor: pointer; z-index: 9999;
    `;
    tooltip.style.top = `${rect.top + window.scrollY - 30}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    document.body.appendChild(tooltip);

    tooltip.addEventListener("click", () => {
      if (textToSave) {
        saveHighlight(textToSave);
        visuallyHighlightSelection();
      }
      tooltip.remove();
    });

    setTimeout(() => {
      document.addEventListener("click", () => tooltip.remove(), { once: true });
    }, 10);
  }

  function visuallyHighlightSelection() {
    // This function logic remains correct.
    if (!lastSelectionRange) return;
    const mark = document.createElement("mark");
    mark.className = "highlighted-text";
    mark.style.backgroundColor = "#ffeb3b";
    try {
      const extracted = lastSelectionRange.extractContents();
      mark.appendChild(extracted);
      lastSelectionRange.insertNode(mark);
      lastSelectionRange = null;
    } catch (err) {
      console.error("❌ Error applying visual highlight:", err);
    }
  }

  // --- 2. REWRITE THE saveHighlight FUNCTION ---
  async function saveHighlight(selectedText) {
    // First, check if we have an ID. If not, we can't save the highlight.
    if (!savedArticleId) {
      console.error("Cannot save highlight: Article ID is missing.");
      alert("Could not save highlight. Please ensure the article is saved first.");
      return;
    }

    if (!selectedText || selectedText.trim() === "") return;

    const highlightPayload = {
      text: selectedText,
      note: "", // You can add UI to capture notes later
      tags: [], // You can add UI to capture tags later
    };

    try {
      // Use the correct endpoint with the stored article ID
      const response = await fetch(`${BASE_URL}/articles/${savedArticleId}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(highlightPayload),
      });
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save highlight");
      }
      console.log("✅ Highlight saved successfully.");
      return true;
    } catch (err) {
      console.error("❌ Error saving highlight:", err);
      return false;
    }
  }

  function applyHighlightToText(textToHighlight) {
    // This function logic remains correct.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.includes(textToHighlight)) {
            const range = document.createRange();
            const index = node.nodeValue.indexOf(textToHighlight);
            range.setStart(node, index);
            range.setEnd(node, index + textToHighlight.length);
            
            const mark = document.createElement("mark");
            mark.className = "highlighted-text";
            mark.style.backgroundColor = "#ffeb3b";
            try {
                range.surroundContents(mark);
            } catch (err) {
                console.warn("⚠️ Could not re-apply highlight:", err);
            }
        }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getCleanArticle") {
      if (typeof Readability === "undefined") {
        sendResponse({ error: "Readability library not available." });
        return false;
      }
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      sendResponse({ article: article });

    } else if (message.action === "activateHighlighting") {
        isHighlightingActive = true;
        console.log("✅ Highlighting activated for this page.");
        sendResponse({ success: true });
    
    // --- 3. UPDATE THE articleSaved LISTENER ---
    } else if (message.action === "articleSaved") {
        // When the background confirms the save, catch and store the ID.
        savedArticleId = message.article.id;
        console.log(`📥 Article save confirmed. Stored ID: ${savedArticleId}`);
        // Now, load any previously saved highlights for this article.
        loadAndRenderHighlights(message.article.url);
    }
    
    return true; 
  });

})();
