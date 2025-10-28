// src/components/CitationGenerator.js
import React, { useState, useEffect } from 'react'; // Keep useEffect import
import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-csl';

const getCitationData = (article) => {
  // ... (Your existing getCitationData function is correct and unchanged)
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

  // --- MOVED useEffect INSIDE the component ---
  useEffect(() => {
    try {
      const cslConfig = plugins.config.get('@csl');
      if (cslConfig && cslConfig.templates) {
        console.log("Available CSL Templates:", cslConfig.templates.list());
      } else {
        console.warn('CSL plugin or templates not found.');
      }
    } catch (e) {
      console.error("Error accessing CSL templates:", e);
    }
  }, []); // Empty dependency array means this runs once when the component mounts
  // --- END MOVED useEffect ---

  // 1. Get the formatted data
  const citationData = getCitationData(article);
  console.log("Data passed to citation-js:", citationData);

  // 2. Function to generate a citation style
  const getCitation = (style) => {
    try {
      const cite = new Cite(citationData);
      let htmlOutput = cite.format('bibliography', {
        format: 'html',
        template: style,
        lang: 'en-US'
      });

      // Manual italics workaround
      if (citationData['container-title']) {
        const siteNameEscaped = citationData['container-title'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${siteNameEscaped}\\.?)`, 'g');
        htmlOutput = htmlOutput.replace(regex, '<i>$1</i>');
      }

      if (style === 'apa') { console.log("Raw APA HTML (after modification):", htmlOutput); }

      return htmlOutput;
    } catch (e) {
      console.error("Citation error:", e);
      return "Could not generate citation.";
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
  const mlaCitation = getCitation('mla');
  const chicagoCitation = getCitation('chicago-author-date');

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
      {/* ... MLA and Chicago blocks ... */}
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
