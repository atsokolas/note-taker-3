// content.js - FINAL VERSION WITH ALL FIXES

(function () {
  console.log('[DEBUG] content.js script has been injected.');

  if (window.hasRunNoteTakerScript) {
    console.log('[DEBUG] content.js already run, returning.');
    return;
  }
  window.hasRunNoteTakerScript = true;

  const BASE_URL = "https://note-taker-3-unrg.onrender.com";
  
  let savedArticleId = null;
  let isHighlightingActive = false;
  let lastSelectionRange = null;

  // --- NEW: Check if article exists when the page loads ---
  const checkForExistingArticle = async () => {
    try {
        const { token } = await chrome.storage.local.get("token");
        if (!token) {
            console.log("[DEBUG] No token found, highlighting will remain inactive.");
            return;
        }

        const encodedUrl = encodeURIComponent(window.location.href);
        const response = await fetch(`${BASE_URL}/api/articles/by-url?url=${encodedUrl}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return;

        const article = await response.json();

        if (article) {
            console.log("[DEBUG] Existing article found on page load:", article);
            savedArticleId = article._id;
            isHighlightingActive = true;
        } else {
            console.log("[DEBUG] No existing article found for this URL.");
        }
    } catch (error) {
        console.error("Error checking for existing article:", error);
    }
  };
  // --------------------------------------------------------

  document.addEventListener("mouseup", (event) => {
    console.log('[DEBUG] "mouseup" event detected. Target:', event.target);
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (!selectedText.length || !isHighlightingActive) {
        const existingTooltip = document.getElementById('highlight-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        if (!isHighlightingActive) {
             console.log('[DEBUG] Highlighting is NOT active. Returning.');
             return;
        }
    }

    if (event.target.closest('#highlight-tooltip')) {
        console.log('[DEBUG] Clicked inside highlight tooltip, ignoring.');
        return;
    }

    if (selectedText.length > 0) {
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
        addTooltipToSelection(selectedText);
    } 
  });

  function addTooltipToSelection(textToSave) {
    const existingTooltip = document.getElementById('highlight-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }
    
    const tooltip = document.createElement("div");
    tooltip.id = 'highlight-tooltip';
    tooltip.className = 'highlight-tooltip-container'; 
    tooltip.innerHTML = `
      <textarea id="highlight-note-input" class="highlight-input" placeholder="Add a note (optional)"></textarea>
      <input type="text" id="highlight-tags-input" class="highlight-input" placeholder="Tags (comma-separated, optional)">
      <button id="save-highlight-button" class="highlight-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="highlight-button-icon">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          Save Highlight
      </button>
    `;
    
    try {
        document.body.appendChild(tooltip);
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        tooltip.style.left = `${window.scrollX + rect.left + (rect.width / 2)}px`;
        tooltip.style.top = `${window.scrollY + rect.top - tooltip.offsetHeight - 15}px`; 
        tooltip.style.transform = 'translateX(-50%)'; 

        const saveButton = document.getElementById("save-highlight-button");
        if (saveButton) {
            saveButton.addEventListener("click", () => {
                const note = document.getElementById("highlight-note-input").value;
                const tags = document.getElementById("highlight-tags-input").value.split(',').map(tag => tag.trim()).filter(tag => tag); 
                saveHighlight(textToSave, note, tags); 
                visuallyHighlightSelection();
                tooltip.remove();
            });
        }
        
        document.removeEventListener("click", handleClickOutside); 
        const dismissTimeout = setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 100);

        function handleClickOutside(event) {
            const clickIsOutsideTooltip = !tooltip.contains(event.target);
            const clickIsOutsideSelection = lastSelectionRange && !lastSelectionRange.getBoundingClientRect().contains(event.clientX, event.clientY);
            
            if (clickIsOutsideTooltip && clickIsOutsideSelection) {
                tooltip.remove();
                document.removeEventListener("click", handleClickOutside);
                clearTimeout(dismissTimeout);
            }
        }
    } catch (e) {
        console.error("❌ [CRITICAL] Error appending or positioning tooltip:", e);
    }
  }

  function visuallyHighlightSelection() {
    if (!lastSelectionRange) return;
    const mark = document.createElement("mark");
    mark.style.backgroundColor = "#ffeb3b";
    mark.style.borderRadius = "3px";
    mark.style.padding = "0 2px"; 
    try {
      lastSelectionRange.surroundContents(mark);
    } catch (err) {
      console.error("❌ Error applying visual highlight:", err);
    }
    window.getSelection().removeAllRanges();
  }

  async function saveHighlight(selectedText, note, tags) {
    if (!savedArticleId) {
      console.error('[CRITICAL] Cannot save highlight because savedArticleId is null.');
      return;
    }
    const highlightPayload = { text: selectedText, note, tags };
    const endpoint = `${BASE_URL}/articles/${savedArticleId}/highlights`;
    try {
      const { token } = await chrome.storage.local.get("token");
      if (!token) throw new Error("Authentication token not found.");
    
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(highlightPayload),
      });    
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Server returned an error");
      }
      console.log("✅ [SUCCESS] Highlight saved.", await response.json());
    } catch (err) {
      console.error("❌ [CRITICAL] Error fetching to save highlight:", err);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getCleanArticle") {
      if (typeof Readability === "undefined") {
        sendResponse({ error: "Readability library not available." });
      } else {
        const documentClone = document.cloneNode(true);
        const reader = new Readability(documentClone);
        const article = reader.parse();
        
        if (!article || !article.content) {
            sendResponse({ error: "Could not parse article content from this page." });
            return;
        }
        
        sendResponse({ article: article });
      } // <-- SYNTAX FIX: This brace was added
    } else if (message.action === "activateHighlighting") {
        isHighlightingActive = true;
        console.log(`[DEBUG] Highlighting activated. isHighlightingActive is now: ${isHighlightingActive}`);
        sendResponse({ success: true });
    } else if (message.action === "articleSaved") {
        savedArticleId = message.article.id;
        console.log(`[DEBUG] 'articleSaved' message received. Stored ID is now: ${savedArticleId}`);
    }
    return false; 
  });

  // --- NEW: Run the check when the script first loads ---
  checkForExistingArticle();

})();
