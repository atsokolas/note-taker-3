// content.js - UPDATED FOR HIGHLIGHT NOTES AND TAGS

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
    // Or when clicking on any input/button inside the tooltip
    if (event.target.closest('#highlight-tooltip')) return; 

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText.length > 0) {
        console.log(`[DEBUG] Text selected: "${selectedText}"`);
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
        // Pass event.clientX/Y to position the tooltip accurately relative to mouseUp
        addTooltipToSelection(selectedText, event.clientX, event.clientY);
    }
  });

  // --- MODIFIED: addTooltipToSelection function ---
  function addTooltipToSelection(textToSave, x, y) {
    console.log('[DEBUG] Creating "Save Highlight" tooltip with notes/tags.');
    const existingTooltip = document.getElementById('highlight-tooltip');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement("div");
    tooltip.id = 'highlight-tooltip';
    tooltip.className = 'highlight-tooltip-content'; // Add a class for styling

    // Add note and tags input fields
    tooltip.innerHTML = `
      <textarea id="highlight-note-input" class="highlight-input" placeholder="Add a note (optional)"></textarea>
      <input type="text" id="highlight-tags-input" class="highlight-input" placeholder="Tags (comma-separated, optional)">
      <button id="save-highlight-button" class="highlight-button">💾 Save Highlight</button>
    `;
    
    // Position the tooltip
    tooltip.style.cssText = `
        position: fixed; 
        top: ${y - 120}px; /* Adjust position to accommodate inputs */
        left: ${x}px; 
        transform: translateX(-50%); /* Center horizontally */
        z-index: 9999;
    `;
    
    document.body.appendChild(tooltip);
    console.log('[DEBUG] Tooltip with inputs added to page.');

    // Add event listener to the new save button
    const saveButton = document.getElementById("save-highlight-button");
    saveButton.addEventListener("click", () => {
      console.log('[DEBUG] "Save Highlight" button CLICKED.');
      const note = document.getElementById("highlight-note-input").value;
      const tags = document.getElementById("highlight-tags-input").value
                          .split(',').map(tag => tag.trim()).filter(tag => tag); // Split by comma, trim, filter empty
      
      saveHighlight(textToSave, note, tags); // Pass note and tags
      visuallyHighlightSelection();
      tooltip.remove();
    });

    // Add click listener to remove tooltip when clicking outside, excluding itself
    const handleClickOutside = (event) => {
        if (!tooltip.contains(event.target) && event.target !== saveButton) {
            tooltip.remove();
            document.removeEventListener("click", handleClickOutside);
        }
    };
    // Use a slight timeout to ensure this listener doesn't immediately fire from the mouseup
    setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
    }, 100);
  }

  function visuallyHighlightSelection() {
    if (!lastSelectionRange) return;
    const mark = document.createElement("mark");
    mark.style.backgroundColor = "#ffeb3b";
    mark.style.borderRadius = "3px"; // Slightly rounded highlight
    mark.style.padding = "0 2px";   // Small padding
    try {
      lastSelectionRange.surroundContents(mark);
    } catch (err) {
      console.error("❌ Error applying visual highlight:", err);
    }
    window.getSelection().removeAllRanges();
  }

  // --- MODIFIED: saveHighlight function to accept note and tags ---
  async function saveHighlight(selectedText, note, tags) {
    console.log('[DEBUG] Entered saveHighlight function with note and tags.');
    if (!savedArticleId) {
      console.error('[CRITICAL] Cannot save highlight because savedArticleId is null.');
      return;
    }

    // --- UPDATED PAYLOAD ---
    const highlightPayload = { 
        text: selectedText,
        note: note,
        tags: tags
    };
    // -----------------------

    const endpoint = `${BASE_URL}/articles/${savedArticleId}/highlights`;
    
    console.log(`[DEBUG] Preparing to POST highlight to: ${endpoint} with payload:`, highlightPayload);

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

      // --- NEW: Send message to ArticleViewer to refresh if it's open ---
      // This part assumes your ArticleViewer.js is part of a web page
      // and not directly interacting with the extension's content script.
      // If ArticleViewer is loaded in the same tab as the extension is active,
      // you might want to send a message to the ArticleViewer component.
      // However, typically, the ArticleViewer would just re-fetch highlights
      // when it re-renders (e.g., if you navigate away and come back, or if its parent refreshes).
      // For now, let's assume the ArticleViewer on the website will eventually
      // reflect the changes. The primary goal here is to save.
      // If the ArticleViewer is a different origin or tab, direct communication is harder.
      // If it's the *same* page where ArticleViewer is embedded, you might trigger a custom event.
      // For now, stick to just saving and letting the web app fetch on its own.

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
      } else {
        const documentClone = document.cloneNode(true);
        const reader = new Readability(documentClone);
        const article = reader.parse();
        sendResponse({ article: article });
      }
    } else if (message.action === "activateHighlighting") {
        isHighlightingActive = true;
        console.log(`[DEBUG] 'activateHighlighting' message received. isHighlightingActive is now: ${isHighlightingActive}`);
        sendResponse({ success: true });
    } else if (message.action === "articleSaved") {
        savedArticleId = message.article.id;
        console.log(`[DEBUG] 'articleSaved' message received. Stored ID is now: ${savedArticleId}`);
    }
    // No return true needed here as all sendResponses are synchronous or not expected
  });

})();
