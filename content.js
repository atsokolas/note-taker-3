// content.js - ULTIMATE DEBUGGING VERSION

(function () {
  console.log('[DEBUG] content.js script has been injected.');

  if (window.hasRunNoteTakerScript) return;
  window.hasRunNoteTakerScript = true;

  const BASE_URL = "https://note-taker-3-unrg.onrender.com";
  
  let savedArticleId = null;
  let isHighlightingActive = false;
  let lastSelectionRange = null;

  document.addEventListener("mouseup", (event) => {
    console.log('[DEBUG] "mouseup" event detected.');
    
    if (!isHighlightingActive) {
      console.log('[DEBUG] Highlighting is not active. Ignoring text selection.');
      return;
    }
    console.log('[DEBUG] Highlighting IS active. Proceeding...');

    // Prevent the tooltip from appearing when clicking on the tooltip itself
    if (event.target.id === 'highlight-tooltip') return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText.length > 0) {
        console.log(`[DEBUG] Text selected: "${selectedText}"`);
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
        addTooltipToSelection(selectedText, event.clientX, event.clientY);
    }
  });

  function addTooltipToSelection(textToSave, x, y) {
    console.log('[DEBUG] Creating "Save Highlight" tooltip.');
    const existingTooltip = document.getElementById('highlight-tooltip');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement("div");
    tooltip.id = 'highlight-tooltip';
    tooltip.innerText = "💾 Save Highlight";
    tooltip.style.cssText = `position: fixed; top: ${y - 40}px; left: ${x}px; background: black; color: white; padding: 8px 12px; border-radius: 6px; font-size: 14px; cursor: pointer; z-index: 9999;`;
    
    tooltip.addEventListener("click", () => {
      console.log('[DEBUG] "Save Highlight" tooltip CLICKED.');
      saveHighlight(textToSave);
      visuallyHighlightSelection();
      tooltip.remove();
    });

    document.body.appendChild(tooltip);
    console.log('[DEBUG] Tooltip added to page.');

    setTimeout(() => {
      document.addEventListener("click", () => tooltip.remove(), { once: true });
    }, 10);
  }

  function visuallyHighlightSelection() {
    if (!lastSelectionRange) return;
    const mark = document.createElement("mark");
    mark.style.backgroundColor = "#ffeb3b";
    try {
      lastSelectionRange.surroundContents(mark);
    } catch (err) {
      console.error("❌ Error applying visual highlight:", err);
    }
    window.getSelection().removeAllRanges();
  }

  async function saveHighlight(selectedText) {
    console.log('[DEBUG] Entered saveHighlight function.');
    if (!savedArticleId) {
      console.error('[CRITICAL] Cannot save highlight because savedArticleId is null.');
      return;
    }

    const highlightPayload = { text: selectedText };
    const endpoint = `${BASE_URL}/articles/${savedArticleId}/highlights`;
    
    console.log(`[DEBUG] Preparing to POST highlight to: ${endpoint}`);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(highlightPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Server returned an error");
      }
      
      const responseData = await response.json();
      console.log("✅ [SUCCESS] Highlight saved.", responseData);

    } catch (err) {
      console.error("❌ [CRITICAL] Error fetching to save highlight:", err);
    }
  }

  // --- MESSAGE LISTENER ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DEBUG] Message received by content script:', message);

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
        console.log(`[DEBUG] 'activateHighlighting' message received. isHighlightingActive is now: ${isHighlightingActive}`);
        sendResponse({ success: true });
    
    } else if (message.action === "articleSaved") {
        savedArticleId = message.article.id;
        console.log(`[DEBUG] 'articleSaved' message received. Stored ID is now: ${savedArticleId}`);
    }
    
    return true; 
  });

})();
