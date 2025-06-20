document.addEventListener("DOMContentLoaded", () => {
    const saveButton = document.querySelector("#saveArticleButton");
    const loadButton = document.querySelector("#loadArticleButton");
    const highlightButton = document.querySelector("#highlightButton");

    if (!saveButton || !loadButton || !highlightButton) {
        console.error("❌ Required buttons missing in popup.html.");
        return;
    }

    saveButton.addEventListener("click", handleSaveArticle);
    loadButton.addEventListener("click", handleLoadArticles);
    highlightButton.addEventListener("click", handleHighlight);

    if (typeof Mark === "function") {
        console.log("✅ Mark.js loaded.");
    } else {
        console.error("❌ Mark.js failed to load.");
    }
});

function cleanContent(rawHtml) {
    // Parse into a temporary DOM first
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
  
    // Remove unwanted elements
    doc.querySelectorAll('ul, nav, header, footer, aside').forEach(el => el.remove());
  
    return doc.body.innerHTML;
  }
  
  function displayHighlights(highlights) {
    const highlightsList = document.createElement('ul');
    highlightsList.innerHTML = highlights
      .map(h => `<li>${h.text} — ${new Date(h.createdAt).toLocaleString()}</li>`)
      .join('');
    
    document.querySelector("#highlights").innerHTML = '';
    document.querySelector("#highlights").appendChild(highlightsList);
  }

async function handleSaveArticle() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return console.error("❌ Active tab not found.");

    // ✅ First, inject the content script
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
        });
        console.log("✅ content.js injected");
    } catch (err) {
        console.error("❌ Failed to inject content.js:", err);
        return;
    }

    // ✅ Then, send the message
    chrome.tabs.sendMessage(tab.id, { action: "extractContent" }, async (response) => {
        if (!response || response.error) return;
      
        // 🔄 Fetch saved highlights from content script
        chrome.tabs.sendMessage(tab.id, { action: "getSavedHighlights" }, async (highlightResponse) => {
          const highlights = highlightResponse?.highlights || [];
      
          const payload = {
            title: response.data.title,
            url: response.data.url,
            content: response.data.content,
            text: response.data.text,
            userId: "exampleUserId",
            highlights, // ✅ Include highlights in payload
          };
      
          try {
            const res = await fetch("https://note-taker-3-unrg.onrender.com/save-article", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          
            if (!res.ok) {
              const errorText = await res.text();
              console.error(`❌ Server error (${res.status}): ${errorText}`);
              alert(`❌ Failed to save article. Server said: ${errorText}`);
              return;
            }
          
            const data = await res.json();
            console.log("✅ Article saved:", data);
            alert("✅ Article & highlights saved!");
          } catch (err) {
            console.error("❌ Network error while saving:", err);
            alert("❌ Network error while saving.");
        }
      });
    }); // <<< THESE TWO
  }

async function handleLoadArticles() {
    try {
        const res = await fetch("https://note-taker-3-unrg.onrender.com/get-articles");
        const articles = await res.json();
        displayArticles(articles);
    } catch (err) {
        console.error("❌ Failed to load articles:", err);
    }
}

async function loadAndDisplayArticle(url) {
    try {
        const res = await fetch(`https://note-taker-3-unrg.onrender.com/get-article?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`Failed to fetch article: ${res.statusText}`);

        const article = await res.json();
        renderArticlePreview(article);
    } catch (err) {
        console.error("❌ Error loading article:", err);
        alert("Failed to load article content.");
    }
}

function displayArticles(articles = []) {
    const container = document.querySelector("#savedArticlesList");
    if (!container) return;

    container.innerHTML = "";

    if (!articles.length) {
        container.innerHTML = "<li>No saved articles found.</li>";
        return;
    }

    articles.forEach(({ title, url }) => {
        const item = document.createElement("li");
        item.textContent = title;
        item.style.cursor = "pointer";
        item.addEventListener("click", () => loadAndDisplayArticle(url));
        container.appendChild(item);
    });
}

function renderArticlePreview(article) {
    const preview = document.querySelector("#articlePreview");
    if (!preview) return;

    const { title, content, highlights } = article;

    preview.innerHTML = `
        <h3>${title}</h3>
        <div>${cleanContent(content)}</div>
    `;

    if (highlights && highlights.length > 0) {
        displayHighlights(highlights);
    } else {
        document.querySelector("#highlights").innerHTML = "<p>No highlights</p>";
    }
}

function handleHighlight() {
    const input = document.querySelector("#highlightInput")?.value.trim();
    const preview = document.querySelector("#articlePreview");

    if (!input) {
        return console.warn("⚠️ No highlight text provided.");
    }
    if (!preview) {
        return console.error("❌ Preview container not found.");
    }

    const mark = new Mark(preview);
    mark.unmark();
    mark.mark(input, {
        className: "highlighted-text",
        separateWordSearch: false
    });

    console.log(`✅ Highlighted: "${input}"`);
}