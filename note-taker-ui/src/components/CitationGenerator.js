// src/components/CitationGenerator.js
import React, { useState, useEffect } from 'react';
import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-csl'; 

// --- CSL Style URLs from the official GitHub repository ---
const STYLES_TO_LOAD = {
  'mla': 'https://raw.githubusercontent.com/citation-style-language/styles/master/modern-language-association.csl',
  'chicago-author-date': 'https://raw.githubusercontent.com/citation-style-language/styles/master/chicago-author-date.csl'
};

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
  // --- NEW: State to track if our styles are loaded ---
  const [stylesLoaded, setStylesLoaded] = useState(false);

  // This useEffect will now fetch and register styles on component mount
  useEffect(() => {
    async function loadStyles() {
      try {
        const cslConfig = plugins.config.get('@csl');
        
        // Use Promise.all to fetch all styles concurrently
        await Promise.all(
          Object.entries(STYLES_TO_LOAD).map(async ([styleName, url]) => {
            // Check if the style is already registered
            if (!cslConfig.templates.has(styleName)) {
              console.log(`Fetching style: ${styleName}...`);
              const response = await fetch(url);
              if (!response.ok) {
                throw new Error(`Failed to fetch ${styleName}: ${response.statusText}`);
              }
              const styleXml = await response.text();
              cslConfig.templates.add(styleName, styleXml);
              console.log(`SUCCESS: Manually registered ${styleName} style.`);
            }
          })
        );
        
        // Log all available templates after we're done
        console.log("Available CSL Templates (after fetch):", cslConfig.templates.list());
        setStylesLoaded(true); // Signal that we're ready to render

      } catch (e) {
        console.error("Error fetching or registering CSL templates:", e);
        setStylesLoaded(true); // Still set to true to avoid infinite loading, even if some failed
      }
    }

    loadStyles();
  }, []); // Empty array ensures this runs only once

  const citationData = getCitationData(article);
  console.log("Data passed to citation-js:", citationData);

  const getCitation = (style) => {
    // --- Check if styles are loaded before trying to format ---
    if (!stylesLoaded) {
      return "Loading citation styles...";
    }
    
    try {
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
    if (htmlText.includes("Loading citation styles...")) return; // Don't copy loading text
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
