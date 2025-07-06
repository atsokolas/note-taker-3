// content.js - FINAL POSITIONING FIX

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

  console.log('[DEBUG] content.js variables initialized. isHighlightingActive:', isHighlightingActive);


  document.addEventListener("mouseup", (event) => {
    console.log('[DEBUG] "mouseup" event detected. Target:', event.target);
    
    if (!isHighlightingActive) {
      console.log('[DEBUG] Highlighting is NOT active. Returning.');
      const existingTooltip = document.getElementById('highlight-tooltip');
      if (existingTooltip) existingTooltip.remove();
      return;
    }
    console.log('[DEBUG] Highlighting IS active. Proceeding...');

    if (event.target.closest('#highlight-tooltip')) {
        console.log('[DEBUG] Clicked inside highlight tooltip, ignoring.');
        return;
    }

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    console.log('[DEBUG] Selected text length:', selectedText.length, 'Selected text:', selectedText);
    
    if (selectedText.length > 0) {
        console.log('[DEBUG] Calling addTooltipToSelection.');
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
        addTooltipToSelection(selectedText);
    } else {
        console.log('[DEBUG] No text selected, removing tooltip if exists.');
        const existingTooltip = document.getElementById('highlight-tooltip');
        if (existingTooltip) existingTooltip.remove();
    }
  });

  function addTooltipToSelection(textToSave) {
    console.log('[DEBUG] Entering addTooltipToSelection function.');
    const existingTooltip = document.getElementById('highlight-tooltip');
    if (existingTooltip) {
      console.log('[DEBUG] Existing tooltip found, removing.');
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
        console.log('[DEBUG] Tooltip appended to document.body.');

        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect(); // This gives viewport-relative coordinates
        
        // --- CRUCIAL CHANGE HERE ---
        // For position:fixed, use viewport-relative coordinates directly
        tooltip.style.left = `${rect.left + (rect.width / 2)}px`; // Center horizontally
        // Position above the selection. Adjust -15px to -20px or -25px if needed for spacing
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 15}px`; 
        // ---------------------------
        
        tooltip.style.transform = 'translateX(-50%)'; // Ensure horizontal centering relative to its own width

        console.log('[DEBUG] Tooltip positioned. Top:', tooltip.style.top, 'Left:', tooltip.style.left, 'Rect Top:', rect.top, 'Rect Left:', rect.left);

        const saveButton = document.getElementById("save-highlight-button");
        if (saveButton) {
            saveButton.addEventListener("click", () => {
                console.log('[DEBUG] "Save Highlight" button CLICKED.');
                const note = document.getElementById("highlight-note-input").value;
                const tags = document.getElementById("highlight-tags-input").value
                                    .split(',').map(tag => tag.trim()).filter(tag => tag); 
                
                saveHighlight(textToSave, note, tags); 
                visuallyHighlightSelection();
                tooltip.remove();
            });
        } else {
            console.error("[ERROR] Save button not found after appending tooltip. DOM might be manipulated.");
        }

        const handleClickOutside = (event) => {
            if (!tooltip.contains(event.target) && lastSelectionRange && !lastSelectionRange.commonAncestorContainer.contains(event.target)) {
                console.log('[DEBUG] Clicked outside tooltip, removing.');
                tooltip.remove();
                document.removeEventListener("click", handleClickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 100);

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
    console.log('[DEBUG] Entered saveHighlight function with note and tags.');
    if (!savedArticleId) {
      console.error('[CRITICAL] Cannot save highlight because savedArticleId is null.');
      return;
    }

    const highlightPayload = { 
        text: selectedText,
        note: note,
        tags: tags
    };

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

    } catch (err) {
      console.error("❌ [CRITICAL] Error fetching to save highlight:", err);
    }
  }

  // --- MESSAGE LISTENER ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DEBUG] Message received by content script:', message);

    let willSendResponseAsync = false; 

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
    return willSendResponseAsync; 
  });

})();
