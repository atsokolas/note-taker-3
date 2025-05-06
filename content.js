let lastSelectionRange = null;

// --- Load highlights when content script runs ---
(async function loadAndRenderHighlights() {
  const articleUrl = window.location.href;

  try {
    const response = await fetch(`https://your-server.com/highlights?url=${encodeURIComponent(articleUrl)}`);
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
  const selectedText = selection.toString().trim();

  if (!selectedText || selectedText.length < 1) return;

  // Save range BEFORE selection is lost
  if (selection.rangeCount > 0) {
    lastSelectionRange = selection.getRangeAt(0).cloneRange();
  }

  addTooltipToSelection(selectedText);
});

// --- Tooltip UI ---
function addTooltipToSelection(selectedText) {
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

  // Save the highlight when clicked
  const selectedText = window.getSelection().toString().trim();
  tooltip.addEventListener('click', () => {
    if (selectedText) {
      saveHighlight(selectedText);
      visuallyHighlightSelection();
    }
  });

  // Remove tooltip if user clicks away
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
    lastSelectionRange.surroundContents(mark);
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

    const response = await fetch("https://your-server.com/highlights", {
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
      range.surroundContents(mark);
    } catch (err) {
      console.warn("⚠️ Could not re-apply highlight:", err);
    }
  }
}