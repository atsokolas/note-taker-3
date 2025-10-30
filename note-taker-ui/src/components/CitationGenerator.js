// src/components/CitationGenerator.js
import React, { useState, useEffect } from 'react';
import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-csl'; 

// --- 1. Manually import (require) the raw CSL style files ---
// We import from '@citation/csl-style-all' which we just installed
let mla, chicago;
try {
  // Use '!!raw-loader!' to import the file as a raw text string
  // This package contains all styles at its root.
  mla = require('!!raw-loader!@citation/csl-style-all/modern-language-association.csl');
  chicago = require('!!raw-loader!@citation/csl-style-all/chicago-author-date.csl');
} catch (e) {
  console.error("Failed to require CSL styles. Make sure '@citation/csl-style-all' is installed.", e);
}
// --- END CSL IMPORT ---


// --- 2. Manually register the templates ---
try {
  const cslConfig = plugins.config.get('@csl');
  
  // Register the styles we just imported
  if (mla && !cslConfig.templates.has('mla')) {
    cslConfig.templates.add('mla', mla);
    console.log("SUCCESS: Manually registered MLA style.");
  }
  if (chicago && !cslConfig.templates.has('chicago-author-date')) {
    cslConfig.templates.add('chicago-author-date', chicago);
    console.log("SUCCESS: Manually registered Chicago style.");
  }
  
  // APA is usually default, but let's add it just in case
  if (templates && templates.has('apa') && !cslConfig.templates.has('apa')) {
    cslConfig.templates.add('apa', templates.get('apa'));
    console.log("SUCCESS: Manually registered APA style.");
  }

} catch (e) {
  console.error("Error registering CSL templates:", e);
}

const getCitationData = (article) => {
  // ... (This function remains the same)
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

  // This useEffect will now log the list *after* our registration attempt
  useEffect(() => {
    try {
      const cslConfig = plugins.config.get('@csl');
      if (cslConfig && cslConfig.templates) {
        console.log("Available CSL Templates (after manual registration):", cslConfig.templates.list()); 
      } else { console.warn('CSL plugin or templates not found.'); }
    } catch (e) { console.error("Error accessing CSL templates:", e); }
  }, []);

  const citationData = getCitationData(article);
  console.log("Data passed to citation-js:", citationData);

  const getCitation = (style) => {
    try {
      // Check if template exists before formatting
      const cslConfig = plugins.config.get('@csl');
      if (!cslConfig || !cslConfig.templates || !cslConfig.templates.has(style)) {
          console.error(`CSL template '${style}' not found.`);
          return `Could not generate ${style.toUpperCase()} citation (template missing).`;
      }
      
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
      console.error(`Citation error for style ${style}:`, e); 
      return `Could not generate ${style.toUpperCase()} citation.`;
    }
  };

  const handleCopy = (format, htmlText) => {
    const plainText = htmlText.replace(/<[^>]+>/g, '');
    navigator.clipboard.writeText(plainText);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

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

