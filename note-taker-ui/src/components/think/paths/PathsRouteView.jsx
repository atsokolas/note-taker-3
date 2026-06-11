import React from 'react';
import ConceptPathWorkspace from '../../paths/ConceptPathWorkspace';

const PathsRouteView = ({
  selectedPathId,
  onSelectPath
}) => (
  <ConceptPathWorkspace
    selectedPathId={selectedPathId}
    onSelectPath={onSelectPath}
  />
);

export default PathsRouteView;
