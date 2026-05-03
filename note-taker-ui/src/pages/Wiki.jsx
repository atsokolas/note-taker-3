import React from 'react';
import { useParams } from 'react-router-dom';

const WikiIndexPlaceholder = () => (
  <section className="think-mode-page wiki-page wiki-page--index" aria-label="Wiki">
    <div className="think-section-home">
      <div className="think-section-home__copy">
        <span className="think-section-home__eyebrow">Wiki</span>
        <h1>Wiki</h1>
        <p>Your wiki pages will appear here.</p>
      </div>
    </div>
  </section>
);

const WikiPageEditorPlaceholder = ({ id }) => (
  <section className="think-mode-page wiki-page wiki-page--editor" aria-label="Wiki page editor">
    <div className="think-section-home">
      <div className="think-section-home__copy">
        <span className="think-section-home__eyebrow">Wiki</span>
        <h1>Wiki Page</h1>
        <p>Editing page {id}.</p>
      </div>
    </div>
  </section>
);

const Wiki = () => {
  const { id } = useParams();
  return id ? <WikiPageEditorPlaceholder id={id} /> : <WikiIndexPlaceholder />;
};

export default Wiki;
