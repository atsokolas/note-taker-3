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

  document.addEventListener("mouseup", (event) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText.length || !isHighlightingActive) {
        const existingTooltip = document.getElementById('nt-tooltip-wrapper');
        if (existingTooltip) existingTooltip.remove();
        return;
    }

    if (event.target.closest('#nt-tooltip-wrapper')) return;

    if (selectedText.length > 0) {
        lastSelectionRange = selection.getRangeAt(0).cloneRange();
        addTooltipToSelection(selectedText);
    } 
  });

  function addTooltipToSelection(textToSave) {
    const existingTooltip = document.getElementById('nt-tooltip-wrapper');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement("div");
    tooltip.id = 'nt-tooltip-wrapper';
  
    tooltip.innerHTML = `
      <style>
        #nt-tooltip-wrapper {
          all: initial;
          position: absolute;
          z-index: 2147483647;
          background-color: white;
          border: 1px solid #ccc;
          border-radius: 8px;
          padding: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .nt-input {
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 6px;
          font-size: 14px;
          width: 250px;
          resize: vertical;
        }
        .nt-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px;
          cursor: pointer;
          font-weight: bold;
        }
        .nt-button:hover {
          background-color: #2980b9;
        }
        .nt-button-icon {
          width: 16px;
          height: 16px;
        }
      </style>
      
      <textarea id="nt-note-input" class="nt-input" placeholder="Add a note (optional)"></textarea>
      <input type="text" id="nt-tags-input" class="nt-input" placeholder="Tags (comma-separated, optional)">
      <button id="nt-save-highlight-button" class="nt-button">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nt-button-icon">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          Save Highlight
      </button>
    `;
    
    document.body.appendChild(tooltip);
    const range = window.getSelection().getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    tooltip.style.left = `${window.scrollX + rect.left + (rect.width / 2)}px`;
    tooltip.style.top = `${window.scrollY + rect.top - tooltip.offsetHeight - 15}px`; 
    tooltip.style.transform = 'translateX(-50%)'; 
  
    document.getElementById("nt-save-highlight-button").addEventListener("click", () => {
        // --- THE ONLY CHANGE IS THIS DEBUGGING LINE ---
        console.log("Save button was clicked."); 
        
        const note = document.getElementById("nt-note-input").value;
        const tags = document.getElementById("nt-tags-input").value.split(',').map(tag => tag.trim()).filter(tag => tag); 
        saveHighlight(textToSave, note, tags); 
        visuallyHighlightSelection();
        tooltip.remove();
    });
  
    setTimeout(() => document.addEventListener("click", handleClickOutside), 100);
  
    function handleClickOutside(event) {
      if (!tooltip.contains(event.target)) {
          tooltip.remove();
          document.removeEventListener("click", handleClickOutside);
      }
    }
  }
  
  function visuallyHighlightSelection() {
    if (!lastSelectionRange) return;
    const mark = document.createElement("mark");
    mark.style.backgroundColor = "#ffeb3b";
    try {
      lastSelectionRange.surroundContents(mark);
    } catch (err) {
      console.error("Error applying visual highlight:", err);
    }
    window.getSelection().removeAllRanges();
  }

  async function saveHighlight(selectedText, note, tags) {
    if (!savedArticleId) {
      console.error('Cannot save highlight because savedArticleId is null.');
      return;
    }
    try {
      const { token } = await chrome.storage.local.get("token");
      if (!token) throw new Error("Authentication token not found.");
    
      const response = await fetch(`${BASE_URL}/articles/${savedArticleId}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ text: selectedText, note, tags }),
      });    
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Server returned an error");
      }
      console.log("Highlight saved.", await response.json());
    } catch (err) {
      console.error("Error fetching to save highlight:", err);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getCleanArticle") {
      if (typeof Readability === "undefined") {
        sendResponse({ error: "Readability library not available." });
        return;
      }
      
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      if (!article || !article.content) {
          sendResponse({ error: "Could not parse article content." });
          return;
      }
      
      sendResponse({ article: article });
    } 
    else if (message.action === "activateHighlighting") {
      isHighlightingActive = true;
      console.log(`[DEBUG] Highlighting activated. isHighlightingActive is now: ${isHighlightingActive}`);
      sendResponse({ success: true });
    } 
    else if (message.action === "articleSaved") {
      savedArticleId = message.article.id;
      console.log(`[DEBUG] 'articleSaved' message received. Stored ID is now: ${savedArticleId}`);
    }
  });

  checkForExistingArticle();
})();
