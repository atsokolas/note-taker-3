// src/components/CitationGenerator.js

import React, { useState } from 'react';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-csl'; // Import CSL plugin

// Helper function to create a simplified data object for the library
const getCitationData = (article) => {
  // Try to parse the date. Handle invalid or empty dates.
  let dateParts = [];
  if (article.publicationDate) {
    try {
      // Create a date object. new Date() is very flexible.
      const d = new Date(article.publicationDate);
      // Check if the date is valid
      if (!isNaN(d.getTime())) { 
        dateParts = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
      }
    } catch (e) {
      console.warn("Could not parse publication date:", article.publicationDate);
    }
  }

  return {
    id: article._id,
    type: 'article-journal', // 'webpage' is also a good option
    title: article.title,
    author: article.author ? [{ literal: article.author }] : [], // Format author as required
    issued: { 'date-parts': [dateParts] }, // Pass the parsed date parts
    'container-title': article.siteName || '', // The name of the website/publication
    URL: article.url
  };
};

const CitationGenerator = ({ article }) => {
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

