import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ConceptPathWorkspace from '../components/paths/ConceptPathWorkspace';
import useDocumentTitle from '../hooks/useDocumentTitle';

// Think's one remaining ledger: learning paths. It is not writing, so it does
// not live in the editor. Work handed to an agent is tracked in Connections.

const ThinkMode = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  useDocumentTitle('Paths', 'Think');
  return (
    <div className="think-ledger">
      <ConceptPathWorkspace
        selectedPathId={searchParams.get('pathId') || ''}
        onSelectPath={(pathId) => setSearchParams(pathId ? { tab: 'paths', pathId } : { tab: 'paths' })}
      />
    </div>
  );
};

export default ThinkMode;
