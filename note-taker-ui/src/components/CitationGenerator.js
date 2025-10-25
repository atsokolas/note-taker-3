// src/components/CitationGenerator.js

import React, { useState } from 'react';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-csl'; // Import CSL plugin

// --- REVISED HELPER FUNCTION ---
const getCitationData = (article) => {
  const data = {
    id: article._id,
    type: 'webpage', // Using webpage type
    title: article.title || '', // Ensure title is passed
    author: article.author ? [{ literal: article.author }] : [], // Keep author format
    URL: article.url || '' // Ensure URL is passed
  };

  // Add publication/site name if available
  if (article.siteName) {
    data['container-title'] = article.siteName;
  }

  // Add date if available and attempt basic parsing
  if (article.publicationDate) {
    // Extract just YYYY-MM-DD
    const dateMatch = article.publicationDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      data.issued = { 'date-parts': [dateMatch[1].split('-')] };
    } else {
      // Fallback for just the year if full date extraction failed
       const yearMatch = article.publicationDate.match(/^(\d{4})/);
       if (yearMatch) {
         data.issued = { 'date-parts': [[yearMatch[1]]] };
       }
    }
  }

  return data;
};
// --- END REVISED HELPER FUNCTION ---

const CitationGenerator = ({ article }) => {
  console.log("Article data for citation:", article);
  const [copiedFormat, setCopiedFormat] = useState(null);
  
  // 1. Get the formatted data
  const citationData = getCitationData(article);

  // 2. Function to generate a citation style
  const getCitation = (style) => {
    try {
      const cite = new Cite(citationData);
      return cite.format('bibliography', {
        format: 'html', // Use HTML for rich text (like italics)
        template: style, // 'apa', 'mla', 'chicago-author-date'
        lang: 'en-US'
      });
    } catch (e) {
      console.error("Citation error:", e);
      return "Could not generate citation.";
    }
  };

  // 3. Handle copy to clipboard
  const handleCopy = (format, htmlText) => {
    // Strip HTML tags for a plain text copy
    const plainText = htmlText.replace(/<[^>]+>/g, '');
    navigator.clipboard.writeText(plainText);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000); // Reset after 2s
  };

  // 4. Generate the formats we want to show
  const apaCitation = getCitation('apa');
  const mlaCitation = getCitation('mla');
  const chicagoCitation = getCitation('chicago-author-date');

  return (
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

