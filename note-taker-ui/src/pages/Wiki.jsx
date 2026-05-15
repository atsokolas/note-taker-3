import React, { useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import WikiIndex from '../components/wiki/WikiIndex';
import WikiList from '../components/wiki/WikiList';
import WikiPageEditor from '../components/wiki/WikiPageEditor';
import WikiPageReadView from '../components/wiki/WikiPageReadView';
import WikiWorkspace from '../components/wiki/WikiWorkspace';
import { trackWikiEditModeEntered } from '../utils/wikiAnalytics';
import { isWikiReadModeV2Enabled, isWikiWorkspaceV1Enabled } from '../utils/wikiFeatureFlags';

const Wiki = () => {
  const { id } = useParams();
  const location = useLocation();
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
  if (location.pathname === '/wiki/workspace') {
    return isWikiWorkspaceV1Enabled() ? <WikiWorkspace /> : <Navigate to="/wiki" replace />;
  }
  if ((location.pathname === '/wiki/list' || id === 'list') && isWikiWorkspaceV1Enabled()) {
    return <Navigate to="/wiki/workspace?view=list" replace />;
  }
  if (location.pathname === '/wiki/list' || id === 'list') return <WikiList />;
  if (!id && isWikiWorkspaceV1Enabled()) return <Navigate to="/wiki/workspace" replace />;
  if (!id) return isWikiReadModeV2Enabled() ? <WikiIndex /> : <WikiList />;
  if (isWikiWorkspaceV1Enabled() && mode !== 'edit') {
    return <Navigate to={`/wiki/workspace?page=${encodeURIComponent(id)}`} replace />;
  }
  if (!isWikiReadModeV2Enabled() || mode === 'edit') {
    return <WikiPageEditor pageId={id} onDoneEditing={() => switchMode('read')} />;
  }
  return <WikiPageReadView pageId={id} onEdit={() => switchMode('edit')} />;
};

export default Wiki;
