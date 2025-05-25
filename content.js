(function () {
  if (window.hasRunNoteTakerScript) return;
  window.hasRunNoteTakerScript = true;

  let lastSelectionRange = null;
  const SERVER_BASE = "https://note-taker-3-1.onrender.com";

  // --- Load highlights when content script runs ---
  (async function loadAndRenderHighlights() {
    const articleUrl = window.location.href;

    try {
      const response = await fetch(`${SERVER_BASE}/highlights?url=${encodeURIComponent(articleUrl)}`);
      const highlights = await response.json();

      if (Array.isArray(highlights)) {
        highlights.forEach((highlight) => {
          applyHighlightToText(highlight.text);
        });
      }
    } catch (err) {
      console.error("❌ Failed to fetch highlights:", err);
    }
  })();

  // --- Listen for text selection and mouseup ---
  document.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    const selected = selection.toString().trim();

    if (!selected || selected.length < 1) return;

    if (selection.rangeCount > 0) {
      lastSelectionRange = selection.getRangeAt(0).cloneRange();
    }

    addTooltipToSelection(selected);
  });

  // --- Tooltip UI ---
  function addTooltipToSelection(textToSave) {
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

    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    tooltip.style.top = `${rect.top + window.scrollY - 30}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(tooltip);

    tooltip.addEventListener('click', () => {
      if (textToSave) {
        saveHighlight(textToSave);
        visuallyHighlightSelection();
      }
      tooltip.remove(); // Remove tooltip immediately after click
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

  // --- Visually wrap selection in <mark> ---
  function visuallyHighlightSelection() {
    if (!lastSelectionRange) return;

    const mark = document.createElement("mark");
    mark.className = "highlighted-text";
    mark.style.backgroundColor = "#ffeb3b";
    mark.style.padding = "0 2px";

    try {
      const extractedContents = lastSelectionRange.extractContents();
      mark.appendChild(extractedContents);
      lastSelectionRange.insertNode(mark);
      lastSelectionRange = null;
    } catch (err) {
      console.error("❌ Error applying visual highlight:", err);
    }
  }

  // --- Save the highlight to your backend ---
  async function saveHighlight(selectedText) {
    if (!selectedText || selectedText.trim() === "") {
      console.warn("⚠️ No valid text selected.");
      return false;
    }

    try {
      const payload = {
        url: window.location.href,
        text: selectedText,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(`${SERVER_BASE}/highlights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  // --- Helper: apply highlight to matching text on load ---
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

    const node = walker.nextNode();
    if (node) {
      const range = document.createRange();
      const index = node.nodeValue.indexOf(textToHighlight);
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
  // --- Listen for messages from popup.js to extract article content ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractContent") {
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

    // Important for async sendResponse
    return true;
  }
});
})();