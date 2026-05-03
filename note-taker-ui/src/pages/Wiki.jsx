import React from 'react';
import { useParams } from 'react-router-dom';
import WikiIndex from '../components/wiki/WikiIndex';

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
  return id ? <WikiPageEditorPlaceholder id={id} /> : <WikiIndex />;
};

export default Wiki;
