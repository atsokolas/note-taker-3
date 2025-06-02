(function () {
  if (window.hasRunNoteTakerScript) return;
  window.hasRunNoteTakerScript = true;

  const SERVER_BASE = "https://note-taker-3-1.onrender.com";
  let lastSelectionRange = null;
  const savedHighlights = [];

  // --- Load and render highlights from the backend ---
  (async function loadAndRenderHighlights() {
    const articleUrl = window.location.href;

    try {
      const response = await fetch(`${SERVER_BASE}/highlights?url=${encodeURIComponent(articleUrl)}`);
      const highlights = await response.json();

      if (Array.isArray(highlights)) {
        savedHighlights.push(...highlights); // Merge server highlights for popup access
        highlights.forEach((highlight) => {
          applyHighlightToText(highlight.text);
        });
      }
    } catch (err) {
      console.error("❌ Failed to fetch highlights:", err);
    }
  })();

  // --- Detect text selection and show tooltip ---
  document.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    const selected = selection.toString().trim();

    if (!selected || selected.length < 1 || selection.rangeCount === 0) return;

    lastSelectionRange = selection.getRangeAt(0).cloneRange();
    addTooltipToSelection(selected);
  });

  // --- Tooltip UI ---
  function addTooltipToSelection(textToSave) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Avoid creating tooltip for collapsed/invisible selections
    if (rect.width === 0 && rect.height === 0) return;

    const tooltip = document.createElement("div");
    tooltip.innerText = "💾 Save Highlight";
    tooltip.style.cssText = `
      position: absolute;
      background: #333;
      color: white;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      z-index: 9999;
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

    // Remove tooltip on outside click
    setTimeout(() => {
      document.addEventListener(
        "click",
        () => tooltip.remove(),
        { once: true }
      );
    }, 10);
  }

  // --- Wrap selected text in a <mark> for visual feedback ---
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

  // --- Save the highlight to the backend ---
  async function saveHighlight(selectedText) {
    if (!selectedText || selectedText.trim() === "") return false;

    const payload = {
      userId: "guest",
      articleUrl: window.location.href,
      text: selectedText,
      note: "",
      tags: [],
      createdAt: new Date().toISOString(),
    };

    savedHighlights.push(payload); // Save locally

    try {
      const response = await fetch(`${SERVER_BASE}/api/highlights`, {
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

  // --- Apply visual highlighting for matching text in the document ---
  function applyHighlightToText(textToHighlight) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          node.nodeValue.includes(textToHighlight)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP,
      }
    );

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

  // --- Unified message listener for popup.js ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSavedHighlights") {
      sendResponse({ highlights: savedHighlights });
    } else if (request.action === "extractContent") {
      try {
        const title = document.title;
        const url = window.location.href;
        const content = document.body.innerHTML;
        const text = document.body.innerText;

        sendResponse({ data: { title, url, content, text } });
      } catch (err) {
        console.error("❌ Failed to extract content:", err);
        sendResponse({ error: "Failed to extract content." });
      }

      return true; // Required for async sendResponse
    }
  });
})();