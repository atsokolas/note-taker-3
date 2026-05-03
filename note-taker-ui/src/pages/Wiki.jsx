import React from 'react';
import { useParams } from 'react-router-dom';
import WikiIndex from '../components/wiki/WikiIndex';
import WikiPageEditor from '../components/wiki/WikiPageEditor';

const Wiki = () => {
  const { id } = useParams();
  return id ? <WikiPageEditor pageId={id} /> : <WikiIndex />;
};

export default Wiki;
