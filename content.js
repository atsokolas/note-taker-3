// content.js - FINAL VERSION
(function () {
  if (window.hasRunNoteTakerScript) return;
  window.hasRunNoteTakerScript = true;

  const BASE_URL = "https://note-taker-3-unrg.onrender.com"; // CORRECTED URL
  // ... all of your other content.js code remains the same ...
  // The rest of the file you provided previously is correct.
  // Just ensure this one line at the top is updated.
  const selfDomain = "note-taker-3-1.onrender.com";

  if (window.location.hostname.includes(selfDomain)) {
    console.log("🚫 Skipping note-taker script on app domain.");
    return;
  }

  let isHighlightingActive = false;
  let lastSelectionRange = null;
  const savedHighlights = [];

  function loadAndRenderHighlights(articleUrl) {
    fetch(`${BASE_URL}/highlights?url=${encodeURIComponent(articleUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((highlights) => {
        if (Array.isArray(highlights)) {
          savedHighlights.push(...highlights);
          highlights.forEach((highlight) => {
            applyHighlightToText(highlight.text);
          });
        }
      })
      .catch((err) => {
        console.warn("No highlights found or failed to load:", err.message);
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
    if (!lastSelectionRange) return;
    const mark = document.createElement("mark");
    mark.className = "highlighted-text";
    mark.style.backgroundColor = "#ffeb3b";
    mark.style.padding = "0 2px";
    try {
      const extracted = lastSelectionRange.extractContents();
      mark.appendChild(extracted);
      lastSelectionRange.insertNode(mark);
      lastSelectionRange = null;
    } catch (err) {
      console.error("❌ Error applying visual highlight:", err);
    }
  }

  async function saveHighlight(selectedText) {
    if (!selectedText || selectedText.trim() === "") return false;
    const highlight = {
      userId: "guest", text: selectedText, note: "", tags: [],
      createdAt: new Date().toISOString(),
    };
    const payload = { url: window.location.href, highlight: highlight };
    savedHighlights.push(highlight);
    try {
      const response = await fetch(`${BASE_URL}/save-highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("❌ Failed to save highlight");
      console.log("✅ Highlight saved.");
      return true;
    } catch (err) {
      console.error("❌ Error saving highlight:", err);
      return false;
    }
  }

  function applyHighlightToText(textToHighlight) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeValue.includes(textToHighlight)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    });
    let node;
    while ((node = walker.nextNode())) {
      const index = node.nodeValue.indexOf(textToHighlight);
      if (index === -1) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + textToHighlight.length);
      const mark = document.createElement("mark");
      mark.className = "highlighted-text";
      mark.style.backgroundColor = "#ffeb3b";
      mark.style.padding = "0 2px";
      try {
        const extracted = range.extractContents();
        mark.appendChild(extracted);
        range.insertNode(mark);
      } catch (err) {
        console.warn("⚠️ Could not re-apply highlight:", err);
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getCleanArticle") {
      if (typeof Readability === "undefined") {
        console.error("❌ Readability.js is not loaded. Check your manifest.json.");
        sendResponse({ error: "Readability library not available." });
        return false;
      }
      
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      sendResponse({ article: article });

    } else if (message.action === "activateHighlighting") {
        isHighlightingActive = true;
        console.log("✅ Highlighting has been automatically activated for this page.");
        sendResponse({ success: true });
    
    } else if (message.action === "getSavedHighlights") {
      sendResponse({ highlights: savedHighlights });
    
    } else if (message.action === "loadHighlights" && message.url) {
      loadAndRenderHighlights(message.url);
    
    } else if (message.action === "articleSaved") {
      const { title, url, id } = message.article;
      console.log("📥 Received confirmation from background that article was saved:", title, url, id);
      loadAndRenderHighlights(url);
    }
    
    return true; 
  });

})();
