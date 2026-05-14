import React, { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import WikiIndex from '../components/wiki/WikiIndex';
import WikiList from '../components/wiki/WikiList';
import WikiPageEditor from '../components/wiki/WikiPageEditor';
import WikiPageReadView from '../components/wiki/WikiPageReadView';
import { trackWikiEditModeEntered } from '../utils/wikiAnalytics';
import { isWikiReadModeV2Enabled } from '../utils/wikiFeatureFlags';

const Wiki = () => {
  const { id } = useParams();
  const [mode, setMode] = useState('read');
  const restoreScrollYRef = useRef(null);
  const switchMode = (nextMode) => {
    if (nextMode === 'edit') trackWikiEditModeEntered({ pageId: id, source: 'wiki_route_shell' });
    restoreScrollYRef.current = typeof window !== 'undefined' ? window.scrollY : null;
    setMode(nextMode);
    window.requestAnimationFrame?.(() => {
      if (restoreScrollYRef.current === null) return;
      window.scrollTo?.(0, restoreScrollYRef.current);
      restoreScrollYRef.current = null;
    });
  };
  if (!id) return isWikiReadModeV2Enabled() ? <WikiIndex /> : <WikiList />;
  if (id === 'list') return <WikiList />;
  if (!isWikiReadModeV2Enabled() || mode === 'edit') {
    return <WikiPageEditor pageId={id} onDoneEditing={() => switchMode('read')} />;
  }
  return <WikiPageReadView pageId={id} onEdit={() => switchMode('edit')} />;
};

export default Wiki;
