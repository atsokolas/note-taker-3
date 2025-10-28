// src/components/CitationGenerator.js
import React, { useState, useEffect } from 'react';
import { Cite, plugins } from '@citation-js/core';
// --- CORRECTED IMPORT ---
// Import plugin-csl AND ALSO get 'templates' from it
import '@citation-js/plugin-csl';
import { templates } from '@citation-js/plugin-csl/lib/styles'; // <--- Get templates from here
// --- END CORRECTION ---

// --- Explicitly register the needed templates ---
try {
  const cslConfig = plugins.config.get('@csl');
  // ... (The rest of the registration code using 'templates.get(...)' remains the same)
  if (!cslConfig.templates.has('mla')) {
    cslConfig.templates.add('mla', templates.get('mla'));
    console.log("Registered MLA style.");
  }
   if (!cslConfig.templates.has('chicago-author-date')) {
    cslConfig.templates.add('chicago-author-date', templates.get('chicago-author-date'));
     console.log("Registered Chicago style.");
  }
   if (!cslConfig.templates.has('apa')) {
    cslConfig.templates.add('apa', templates.get('apa'));
     console.log("Registered APA style.");
  }
} catch (e) {
  console.error("Error registering CSL templates:", e);
}
// --- END Registration ---

const getCitationData = (article) => {
  // ... (Your getCitationData function remains the same)
  // ... (type: 'article-journal' is correct)
  const data = {
    id: article._id,
    type: 'article-journal', 
    title: article.title || '',
    author: article.author ? [{ literal: article.author }] : [],
    URL: article.url || ''
  };
  if (article.siteName) {
    data['container-title'] = article.siteName;
  }
  if (article.publicationDate) {
    const dateMatch = article.publicationDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      data.issued = { 'date-parts': [dateMatch[1].split('-')] };
    } else {
       const yearMatch = article.publicationDate.match(/^(\d{4})/);
       if (yearMatch) {
         data.issued = { 'date-parts': [[yearMatch[1]]] };
       }
    }
  }
  return data;
};

const CitationGenerator = ({ article }) => {
  console.log("Article data for citation:", article);
  const [copiedFormat, setCopiedFormat] = useState(null);

  // useEffect for checking templates (optional now, but keep for debugging)
  useEffect(() => {
    try {
      const cslConfig = plugins.config.get('@csl');
      if (cslConfig && cslConfig.templates) {
        // Log again to confirm registration worked
        console.log("Available CSL Templates (after registration):", cslConfig.templates.list()); 
      } else { console.warn('CSL plugin or templates not found.'); }
    } catch (e) { console.error("Error accessing CSL templates:", e); }
  }, []);

  // 1. Get the formatted data
  const citationData = getCitationData(article);
  console.log("Data passed to citation-js:", citationData);

  // 2. Function to generate a citation style
  const getCitation = (style) => {
    try {
      const cite = new Cite(citationData);
      let htmlOutput = cite.format('bibliography', {
        format: 'html',
        template: style, // Use the now-registered style names
        lang: 'en-US'
      });

      // Manual italics workaround (keep this, it might still be needed)
      if (citationData['container-title']) {
        const siteNameEscaped = citationData['container-title'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${siteNameEscaped}\\.?)`, 'g');
        htmlOutput = htmlOutput.replace(regex, '<i>$1</i>');
      }

      if (style === 'apa') { console.log("Raw APA HTML (after modification):", htmlOutput); }

      return htmlOutput;
    } catch (e) {
      console.error(`Citation error for style ${style}:`, e); // Log style name
      return `Could not generate ${style.toUpperCase()} citation.`;
    }
  };

  // 3. Handle copy to clipboard
  const handleCopy = (format, htmlText) => {
    // ... (rest of handleCopy function)
     const plainText = htmlText.replace(/<[^>]+>/g, '');
    navigator.clipboard.writeText(plainText);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  // 4. Generate the formats we want to show
  const apaCitation = getCitation('apa');
  const mlaCitation = getCitation('mla'); // Should now work
  const chicagoCitation = getCitation('chicago-author-date'); // Should now work

  return (
    // ... (Your existing JSX remains unchanged)
     <div className="citation-generator">
      <h4>Generate Citations</h4>
      <div className="citation-block">
        <strong>APA</strong>
        <div className="citation-text" dangerouslySetInnerHTML={{ __html: apaCitation }} />
        <button onClick={() => handleCopy('APA', apaCitation)} className="citation-copy-btn">
          {copiedFormat === 'APA' ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="citation-block">
        <strong>MLA</strong>
        <div className="citation-text" dangerouslySetInnerHTML={{ __html: mlaCitation }} />
        <button onClick={() => handleCopy('MLA', mlaCitation)} className="citation-copy-btn">
          {copiedFormat === 'MLA' ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="citation-block">
        <strong>Chicago</strong>
        <div className="citation-text" dangerouslySetInnerHTML={{ __html: chicagoCitation }} />
        <button onClick={() => handleCopy('Chicago', chicagoCitation)} className="citation-copy-btn">
          {copiedFormat === 'Chicago' ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

export default CitationGenerator;
